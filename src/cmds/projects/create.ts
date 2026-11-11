import type { Argv } from 'yargs';
import type { ApiResponse } from '../../api.ts';
import type { Args, Command } from '../../command.ts';
import { withExamples } from '../../command.ts';
import * as log from '../../log.ts';
import * as projects from '../../projects.ts';
import * as prompt from '../../prompt.ts';
import type {
  AccountsResponse,
  CreateProjectBody,
  ProjectResponse,
} from '../../types.ts';
import * as v1 from '../../v1.ts';

const builder = (yargs: Argv) =>
  v1
    .interactiveOption(v1.idempotencyOption(v1.options(yargs)))
    .positional('name', {
      type: 'string',
      describe: "The project's name",
    })
    .option('account', {
      type: 'string',
      describe:
        'The account to create it on, by its acct_ id. Needed only when you can use several',
    });

type CreateArgs = Args<typeof builder>;

/** The questions a create was asked through, for it to finish off. */
interface Session {
  /** Stops the spinner, which says so if the project wasn't created. */
  settled(response: ApiResponse<ProjectResponse> | null): void;
  /** Ends the questions, once the project's details are under them. */
  close(): void;
}

/**
 * Creates the project and prints it: its details in a note, and what's
 * left to do in a box. With a `session` the note is drawn as the last
 * part of the questions.
 */
const create = async (args: CreateArgs, session?: Session): Promise<void> => {
  const data: CreateProjectBody = {};
  if (args.name !== undefined) data.name = args.name;
  if (args.account) data.account_id = args.account;

  const response = await v1.call<ProjectResponse>(
    args,
    {
      method: 'post',
      path: '/api/v1/projects',
      data,
      headers: v1.idempotencyHeaders(args),
    },
    { settled: session?.settled },
  );
  if (!response) return;

  v1.print(args, response, ({ project, next_steps }) => {
    if (v1.replayed(response)) {
      log.meta(
        'An earlier request used this idempotency key. Nothing new was created.',
      );
    }
    if (session) {
      projects.note(project, { guide: true });
      session.close();
    } else {
      projects.note(project);
      console.log('');
    }
    v1.nextSteps(next_steps, {
      rewrite: {
        create_form: `Add a form to it: ${log.variable(
          `formspree forms create --project ${project.id}`,
        )}`,
      },
    });
  });
};

const handler = v1.run(async (args: CreateArgs) => {
  // A project is its name and its account. In a terminal the command asks
  // for whichever wasn't given: --account answers its own question only.
  const missing = args.name === undefined || args.account === undefined;
  if (!missing || !v1.asks(args, [])) {
    await create(args);
    return;
  }

  const listed = await v1.call<AccountsResponse>(args, {
    method: 'get',
    path: '/api/v1/accounts',
  });
  if (!listed) return;

  const known = {
    name: args.name,
    account: args.account,
    accounts: listed.data.accounts,
  };
  if (!projects.hasQuestions(known)) {
    await create(args);
    return;
  }

  await prompt.session(async (p) => {
    p.intro('New project');
    const answers = await projects.ask(p, known);

    const spinner = p.spinner({ guide: false });
    spinner.start('Creating the project');
    await create(
      { ...args, ...answers },
      {
        settled: (response) => {
          // The note under it says so: no line of the spinner's own.
          if (response) {
            spinner.clear();
          } else {
            spinner.error('The project was not created');
          }
        },
        close: () => p.outro('Add a form to it next.'),
      },
    );
  });
});

export const command: Command<typeof builder> = {
  command: 'create [name]',
  describe: 'Creates a project',
  builder: withExamples(builder, [
    ['$0 projects create', 'Asks for the name, in a terminal'],
    ['$0 projects create "Marketing site"', 'Creates it without asking'],
    [
      '$0 projects create "Marketing site" --account acct_7d3f9a2c8e1b4f6a0c55 --json',
      'On one account, printing the new project as JSON',
    ],
  ]),
  handler,
};
