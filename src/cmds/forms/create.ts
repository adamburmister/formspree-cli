import type { Argv } from 'yargs';
import type { ApiResponse } from '../../api.ts';
import type { Args, Command } from '../../command.ts';
import { withExamples } from '../../command.ts';
import * as forms from '../../forms.ts';
import * as log from '../../log.ts';
import * as prompt from '../../prompt.ts';
import type {
  AccountsResponse,
  CreateFormBody,
  FormResponse,
  ProjectsResponse,
} from '../../types.ts';
import * as v1 from '../../v1.ts';

const builder = (yargs: Argv) =>
  forms
    .bodyOptions(v1.interactiveOption(v1.idempotencyOption(v1.options(yargs))))
    .positional('name', {
      type: 'string',
      describe: "The form's name",
    })
    .option('project', {
      type: 'string',
      describe: 'The project to create it in, by its id',
    })
    .option('project-name', {
      type: 'string',
      describe:
        'The project to create it in, by name. Made if missing. Without either, the form lands in "Default Project"',
    })
    .option('account', {
      type: 'string',
      describe:
        'The account to create it on, by its acct_ id. Needed only when you can use several',
    })
    .conflicts('project', ['project-name', 'account']);

type CreateArgs = Args<typeof builder>;

/** The questions a create was asked through, for it to finish off. */
interface Session {
  /** Stops the spinner, which says so if the form wasn't created. */
  settled(response: ApiResponse<FormResponse> | null): void;
  /** Ends the questions, once the form's details are under them. */
  close(): void;
}

/**
 * Creates the form and prints it: its details in a note, the HTML for it
 * bare, so it copies clean, and what's left to do in a box. With a
 * `session` the note is drawn as the last part of the questions.
 */
const create = async (args: CreateArgs, session?: Session): Promise<void> => {
  const data: CreateFormBody = forms.body(args);
  if (args.project !== undefined) data.project_id = args.project;
  if (args.projectName !== undefined) data.project = args.projectName;
  if (args.account !== undefined) data.account_id = args.account;

  const response = await v1.call<FormResponse>(
    args,
    {
      method: 'post',
      path: '/api/v1/forms',
      data,
      headers: v1.idempotencyHeaders(args),
    },
    { settled: session?.settled },
  );
  if (!response) return;

  v1.print(args, response, ({ form, next_steps }) => {
    if (v1.replayed(response)) {
      log.meta(
        'An earlier request used this idempotency key. Nothing new was created.',
      );
    }
    if (session) {
      forms.note(form, { guide: true });
      session.close();
    } else {
      forms.note(form);
      console.log('');
    }
    forms.embed(form);
    // The snippet is how to wire the endpoint, so that step isn't repeated.
    v1.nextSteps(next_steps, { rewrite: { wire_endpoint: null } });
  });
};

const handler = v1.run(async (args: CreateArgs) => {
  // The options that say what the form is. With none of them, in a
  // terminal, the command asks instead. --project, --project-name and
  // --account only say where it goes: each answers its own question, and
  // the rest are still asked.
  const contents = [
    args.formKey,
    args.email,
    args.webhook,
    args.app,
    args.redirect,
    args.recaptcha,
    args.from,
    args.stdin,
  ];
  if (!v1.asks(args, contents)) {
    await create(args);
    return;
  }

  const owners = await v1.call<AccountsResponse>(args, {
    method: 'get',
    path: '/api/v1/accounts',
  });
  if (!owners) return;

  // The projects are only for the project question. A login that can't
  // list them can still name one.
  const placed = args.project !== undefined || args.projectName !== undefined;
  const listed = placed
    ? null
    : await v1.call<ProjectsResponse>(
        args,
        { method: 'get', path: '/api/v1/projects' },
        { optional: true },
      );

  await prompt.session(async (p) => {
    p.intro('New form');
    const answers = await forms.ask(p, {
      name: args.name,
      project: args.project,
      projectName: args.projectName,
      account: args.account,
      accounts: owners.data.accounts,
      projects: listed?.data.projects ?? [],
    });

    const spinner = p.spinner({ guide: false });
    spinner.start('Creating the form');
    await create(
      { ...args, ...answers },
      {
        settled: (response) => {
          // The note under it says so: no line of the spinner's own.
          if (response) {
            spinner.clear();
          } else {
            spinner.error('The form was not created');
          }
        },
        // The snippet is printed outside the prompts, so it copies clean.
        close: () => p.outro('Add it to your site with the HTML below.'),
      },
    );
  });
});

export const command: Command<typeof builder> = {
  command: 'create [name]',
  describe: 'Creates a form on Formspree',
  builder: withExamples(builder, [
    ['$0 forms create', 'Asks for each value, in a terminal'],
    [
      '$0 forms create "Contact" --email you@example.com',
      'Creates it from the options, with no questions',
    ],
    [
      '$0 forms create "Contact" --project proj_2pn3r0jq7zz0t --app slack --json',
      'In one project, printing the new form as JSON',
    ],
    [
      '$0 forms create --from contact.json',
      'Creates it from a JSON file, which can hold field rules',
    ],
  ]),
  handler,
};
