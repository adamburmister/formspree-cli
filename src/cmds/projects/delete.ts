import type { Argv } from 'yargs';
import type { ApiResponse } from '../../api.ts';
import type { Args, Command } from '../../command.ts';
import { withExamples } from '../../command.ts';
import * as forms from '../../forms.ts';
import * as log from '../../log.ts';
import * as projects from '../../projects.ts';
import * as prompt from '../../prompt.ts';
import * as spinner from '../../spinner.ts';
import type {
  FormsResponse,
  FormSummary,
  ProjectResponse,
  ProjectsResponse,
} from '../../types.ts';
import { isObject, sleep } from '../../util.ts';
import * as v1 from '../../v1.ts';

// A deleted form is hidden at once, but the server removes it in the
// background, and until then the project still counts as having forms.
// This is how long the command waits for that: 15 tries, 2 seconds apart.
const ATTEMPTS = 15;
const PAUSE = 2000;

const builder = (yargs: Argv) =>
  v1
    .options(yargs)
    .positional('project', {
      type: 'string',
      describe:
        "The project's id. Leave it out in a terminal to pick from a list",
    })
    .option('forms', {
      type: 'boolean',
      describe:
        "With --yes, delete the project's forms and their submissions too. A project that has forms can't be deleted otherwise",
    })
    .option('yes', {
      alias: 'y',
      type: 'boolean',
      describe: 'Delete without asking first',
    });

type DeleteArgs = Args<typeof builder>;

/** The project to delete, and what to call it when asking and reporting. */
interface Target {
  id: string;
  title: string;
}

const count = (items: readonly unknown[]): string =>
  items.length === 1 ? '1 form' : `${items.length} forms`;

/**
 * Asks which project to delete, for when no id was given. Resolves with
 * undefined when there's nothing to pick: the projects couldn't be listed,
 * which has been reported by then, or there are none.
 */
const pick = async (args: DeleteArgs): Promise<Target | undefined> => {
  const listed = await v1.call<ProjectsResponse>(args, {
    method: 'get',
    path: '/api/v1/projects',
  });
  if (!listed) return undefined;

  if (!listed.data.projects.length) {
    log.meta('No projects to delete');
    return undefined;
  }

  const project = await prompt.session((p) =>
    projects.pick(p, 'Project to delete', listed.data.projects),
  );
  return { id: project.id, title: projects.line(project) };
};

/**
 * The project with the given id, called by its name when that can be
 * read. When it can't, the id stands in: listing its forms comes next,
 * and says what's wrong with the id if anything is.
 */
const named = async (args: DeleteArgs, id: string): Promise<Target> => {
  const found = await v1.call<ProjectResponse>(
    args,
    { method: 'get', path: `/api/v1/projects/${v1.segment(id)}` },
    { optional: true },
  );
  return { id, title: found ? projects.line(found.data.project) : id };
};

/**
 * Whether the API refused to delete a project because it has forms, or
 * has deleted forms that are still being removed.
 */
const notEmpty = (response: ApiResponse): boolean =>
  response.status === 409 &&
  isObject(response.data) &&
  String(response.data.type).endsWith('/project-not-empty');

/** Whether the project's only forms are deleted ones, soon to be gone. */
const emptying = (response: ApiResponse): boolean =>
  notEmpty(response) &&
  isObject(response.data) &&
  response.data.retryable === true;

/**
 * Asks the API to delete the project. Resolves with its answer when that's
 * the delete or a refusal over the project's forms, which is the caller's
 * to handle. Any other answer is reported, and it resolves with null.
 */
const send = (
  args: DeleteArgs,
  id: string,
  settled?: (response: ApiResponse | null) => void,
): Promise<ApiResponse | null> =>
  v1.call(
    args,
    { method: 'delete', path: `/api/v1/projects/${v1.segment(id)}` },
    { accept: notEmpty, settled },
  );

/**
 * Deletes the project, waiting while forms deleted a moment ago are still
 * being removed. Resolves as `send` does: with the refusal over its forms
 * when the wait runs out, or when the project has forms that aren't
 * deleted.
 */
const remove = async (
  args: DeleteArgs,
  id: string,
): Promise<ApiResponse | null> => {
  let waiting: { clear(): void } | undefined;
  const stop = (): void => {
    waiting?.clear();
    waiting = undefined;
  };

  for (let attempt = 1; ; attempt += 1) {
    // An answer that gets reported is written where the spinner was.
    const response = await send(args, id, (settled) => {
      if (!settled) stop();
    });
    if (!response || !emptying(response) || attempt === ATTEMPTS) {
      stop();
      return response;
    }
    waiting ??= spinner.start('Waiting for the deleted forms to be removed');
    await sleep(PAUSE);
  }
};

/**
 * Deletes the forms, saying so for each one. Resolves with the hashids of
 * those deleted, or with null once one can't be: the reason has been
 * reported by then, with how far it got.
 */
const empty = async (
  args: DeleteArgs,
  inside: readonly FormSummary[],
): Promise<string[] | null> => {
  const deleted: string[] = [];

  for (const form of inside) {
    const response = await v1.call(args, {
      method: 'delete',
      path: `/api/v1/forms/${v1.segment(form.hashid)}`,
    });
    if (!response) {
      console.error(
        `  ${deleted.length} of ${count(inside)} deleted. The project was not deleted.`,
      );
      return null;
    }
    deleted.push(form.hashid);
    if (!args.json) log.success(`Form deleted: ${forms.line(form)}`);
  }
  return deleted;
};

/**
 * Whether to go ahead: --yes says so, with --forms for a project that has
 * any; otherwise it's asked, naming the forms that would go.
 */
const agreed = async (
  args: DeleteArgs,
  target: Target,
  inside: readonly FormSummary[],
): Promise<boolean> => {
  if (args.yes) {
    if (inside.length && !args.forms) {
      throw new v1.UsageError(
        `Project ${target.title} has ${count(inside)}. Pass --forms to delete them and their submissions too`,
        {
          code: 'CONFIRMATION_REQUIRED',
          next: [
            {
              step: 'confirm_forms',
              detail:
                "Run the command again with --yes --forms. The project's forms and their submissions are deleted for good.",
            },
          ],
        },
      );
    }
    return true;
  }

  if (inside.length) {
    console.error('');
    console.error(`  ${target.title} has ${count(inside)}:`);
    for (const form of inside) console.error(`  - ${forms.line(form)}`);
    console.error('');
  }
  return prompt.session((p) =>
    p.confirm({
      message: inside.length
        ? `Delete project ${target.title}, its ${count(inside)} and their submissions?`
        : `Delete project ${target.title}?`,
      initialValue: false,
    }),
  );
};

const report = (
  args: DeleteArgs,
  target: Target,
  deleted: readonly string[],
): void => {
  if (args.json) {
    console.log(
      JSON.stringify({ deleted: target.id, forms: deleted }, null, 2),
    );
  } else {
    log.success(`Project deleted: ${target.title}`);
  }
};

const handler = v1.run(async (args: DeleteArgs) => {
  const attended = prompt.interactive();
  if (args.project === undefined && (args.json || !attended)) {
    throw new v1.UsageError(
      'Say which project to delete: formspree projects delete <project>',
      {
        code: 'MISSING_ARGUMENT',
        next: [
          {
            step: 'list_projects',
            detail: 'List the projects to find the one to delete, by its id.',
            command: 'formspree projects list --json',
          },
        ],
      },
    );
  }
  if (!args.yes && !attended) {
    throw new v1.UsageError(
      'Pass --yes to delete a project when nobody can confirm it',
      {
        code: 'CONFIRMATION_REQUIRED',
        next: [
          {
            step: 'confirm',
            detail:
              'Run the command again with --yes. The project is deleted for good.',
          },
        ],
      },
    );
  }

  const target =
    args.project === undefined
      ? await pick(args)
      : await named(args, args.project);
  if (!target) return;

  const listed = await v1.call<FormsResponse>(args, {
    method: 'get',
    path: '/api/v1/forms',
    params: { project_id: target.id },
  });
  if (!listed) return;
  const inside = listed.data.forms;

  if (!(await agreed(args, target, inside))) {
    log.meta('Nothing deleted');
    return;
  }

  let deleted: string[] = [];
  if (inside.length) {
    // The API only deletes an empty project, so its forms go first. But
    // no form goes unless the project can: asking for the delete now gets
    // a login or key that may not delete it refused while the forms are
    // all still there.
    const allowed = await send(args, target.id);
    if (!allowed) return;

    // Anything but that refusal is the delete itself: the forms went
    // between being listed and now.
    if (notEmpty(allowed)) {
      const emptied = await empty(args, inside);
      if (!emptied) return;
      deleted = emptied;
    } else {
      report(args, target, deleted);
      return;
    }
  }

  const response = await remove(args, target.id);
  if (!response) return;

  if (notEmpty(response)) {
    v1.refused(args, response);
    if (!args.json && emptying(response)) {
      console.error(
        `  Run ${log.variable(
          `formspree projects delete ${target.id}`,
        )} again in a moment.`,
      );
    }
    return;
  }
  report(args, target, deleted);
});

export const command: Command<typeof builder> = {
  command: 'delete [project]',
  describe: 'Deletes a project, and its forms once you agree to that',
  builder: withExamples(builder, [
    ['$0 projects delete', 'Lists the projects to pick from, then asks'],
    [
      '$0 projects delete proj_2pn3r0jq7zz0t --yes',
      'Deletes a project that has no forms, without asking',
    ],
    [
      '$0 projects delete proj_2pn3r0jq7zz0t --yes --forms',
      "Deletes the project's forms and their submissions too",
    ],
  ]),
  handler,
};
