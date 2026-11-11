import type { Argv } from 'yargs';
import type { Args, Command } from '../../command.ts';
import * as forms from '../../forms.ts';
import * as log from '../../log.ts';
import * as prompt from '../../prompt.ts';
import type { FormsResponse } from '../../types.ts';
import * as v1 from '../../v1.ts';

const builder = (yargs: Argv) =>
  v1
    .options(yargs)
    .positional('form', {
      type: 'string',
      describe:
        "The form's hashid. Leave it out in a terminal to pick from a list",
    })
    .option('yes', {
      alias: 'y',
      type: 'boolean',
      describe: 'Delete without asking first',
    });

type DeleteArgs = Args<typeof builder>;

/** The form to delete, and what to call it when asking and reporting. */
interface Target {
  hashid: string;
  title: string;
}

/**
 * Asks which form to delete, for when no id was given. Resolves with
 * undefined when there's nothing to pick: the forms couldn't be listed,
 * which has been reported by then, or there are none.
 */
const pick = async (args: DeleteArgs): Promise<Target | undefined> => {
  if (args.json || !prompt.interactive()) {
    throw new v1.UsageError(
      'Say which form to delete: formspree forms delete <form>',
      {
        code: 'MISSING_ARGUMENT',
        next: [
          {
            step: 'list_forms',
            detail: 'List the forms to find the one to delete, by its hashid.',
            command: 'formspree forms list --json',
          },
        ],
      },
    );
  }

  const listed = await v1.call<FormsResponse>(args, {
    method: 'get',
    path: '/api/v1/forms',
  });
  if (!listed) return undefined;

  if (!listed.data.forms.length) {
    log.meta('No forms to delete');
    return undefined;
  }

  const form = await prompt.session((p) =>
    forms.pick(p, 'Form to delete', listed.data.forms),
  );
  return { hashid: form.hashid, title: forms.line(form) };
};

const handler = v1.run(async (args: DeleteArgs) => {
  const target =
    args.form === undefined
      ? await pick(args)
      : { hashid: args.form, title: args.form };
  if (!target) return;

  if (!args.yes) {
    if (!prompt.interactive()) {
      throw new v1.UsageError(
        'Pass --yes to delete a form when nobody can confirm it',
        {
          code: 'CONFIRMATION_REQUIRED',
          next: [
            {
              step: 'confirm',
              detail:
                'Run the command again with --yes. The form and its submissions are deleted for good.',
            },
          ],
        },
      );
    }
    const agreed = await prompt.session((p) =>
      p.confirm({
        message: `Delete form ${target.title} and its submissions?`,
        initialValue: false,
      }),
    );
    if (!agreed) {
      log.meta('Nothing deleted');
      return;
    }
  }

  const response = await v1.call(args, {
    method: 'delete',
    path: `/api/v1/forms/${v1.segment(target.hashid)}`,
  });
  if (!response) return;

  if (args.json) {
    console.log(JSON.stringify({ deleted: target.hashid }, null, 2));
  } else {
    log.success(`Form deleted: ${target.title}`);
  }
});

export const command: Command<typeof builder> = {
  command: 'delete [form]',
  describe: 'Deletes a form and its submissions',
  builder,
  handler,
};
