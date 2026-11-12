import type { Argv } from 'yargs';
import { JSON_BY_DEFAULT } from '../agent.ts';
import type { Args, Command } from '../command.ts';
import { withExamples } from '../command.ts';
import * as failure from '../failure.ts';
import type { Step } from '../failure.ts';
import * as log from '../log.ts';
import * as login from '../login.ts';
import * as messages from '../messages.ts';
import * as oauth from '../oauth.ts';
import * as spin from '../spinner.ts';

const builder = (yargs: Argv) =>
  yargs
    .option('scope', {
      type: 'string',
      describe: 'Space-separated scopes to request',
      default: oauth.DEFAULT_SCOPE,
    })
    .option('browser', {
      type: 'boolean',
      default: true,
      describe:
        'Open the login link in your browser. Turn off with --no-browser to only print it',
    })
    .option('json', {
      type: 'boolean',
      describe: `Start a login for someone else to approve: print the link and the code as JSON, and return without waiting. Finish it with --complete. ${JSON_BY_DEFAULT}`,
    })
    .option('complete', {
      type: 'boolean',
      describe: 'Finish a login that --json started, once it has been approved',
    })
    .option('wait', {
      type: 'number',
      default: 60,
      describe: 'How many seconds --complete waits for the approval',
    })
    // Declared only so `login --key` (or `-k`) is caught, not silently
    // ignored.
    .option('key', {
      alias: 'k',
      type: 'string',
      hidden: true,
    });

type LoginArgs = Args<typeof builder>;

/** What's left to do with a login that's waiting to be approved. */
const approval = (link: string, code: string): Step[] => [
  {
    step: 'ask_user_to_approve',
    detail: `Ask the user to open the link, check that it shows the code ${code}, and approve.`,
    url: link,
  },
  {
    step: 'complete_login',
    detail:
      'Once they have approved, run this to finish logging in. It waits up to a minute for the approval.',
    command: 'formspree login --complete',
  },
];

/**
 * Starts a login and hands it over: prints the link and the code for
 * someone to approve with, and what to run once they have.
 */
const handOver = async (
  args: LoginArgs,
  endpoint: string,
  clientId: string,
): Promise<void> => {
  try {
    const device = await login.start({
      endpoint,
      clientId,
      scope: args.scope || oauth.DEFAULT_SCOPE,
    });

    console.log(
      JSON.stringify(
        {
          status: 'pending',
          endpoint,
          verification_uri: device.verification_uri,
          verification_uri_complete: device.verification_uri_complete,
          user_code: device.user_code,
          expires_in: device.expires_in ?? 900,
          next_steps: approval(
            device.verification_uri_complete,
            device.user_code,
          ),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    login.reportFailure(args, login.describe(error, endpoint));
  }
};

/** Finishes a login that was handed over, once it has been approved. */
const finish = async (args: LoginArgs, endpoint: string): Promise<void> => {
  // With --json there's nobody watching a spinner.
  const spinner = args.json
    ? undefined
    : spin.start('Waiting for you to approve in the browser');
  const outcome = await login.complete({ endpoint, wait: args.wait ?? 60 });
  spinner?.clear();

  switch (outcome.status) {
    case 'logged_in':
      if (args.json) {
        console.log(
          JSON.stringify(
            { logged_in: true, endpoint, scope: outcome.login?.scope },
            null,
            2,
          ),
        );
      } else {
        log.success('Logged in');
      }
      return;

    case 'pending':
      failure.report(args, {
        code: 'LOGIN_PENDING',
        message: 'The login has not been approved yet',
        // Nothing's wrong: the same command works once it's approved.
        retryable: true,
        next: approval(
          outcome.waiting.verification_uri_complete,
          outcome.waiting.user_code,
        ),
      });
      return;

    case 'none':
      failure.report(args, {
        code: 'NO_PENDING_LOGIN',
        message: 'No login is waiting to be completed',
        next: [
          {
            step: 'start_login',
            detail:
              'Start a login first. It prints the link for the user to approve with.',
            command: 'formspree login --json',
          },
        ],
      });
      return;

    case 'failed':
      login.reportFailure(args, login.describe(outcome.error, endpoint));
  }
};

const handler = async (args: LoginArgs): Promise<void> => {
  const endpoint = oauth.endpoint();
  const clientId = oauth.clientIdFor(endpoint);

  if (args.key) {
    const fix =
      'Pass --key to the command itself, or set the FORMSPREE_API_KEY env variable.';
    failure.report(
      args,
      {
        code: 'INVALID_USAGE',
        message: "API keys don't need a login",
        next: [{ step: 'use_key', detail: fix }],
      },
      () => {
        log.error("API keys don't need a login");
        log.meta(
          `Pass ${log.variable(
            '--key',
          )} to the command itself, or set the ${log.variable(
            'FORMSPREE_API_KEY',
          )} env variable.`,
        );
      },
    );
    return;
  }

  // No client id: a development endpoint without FORMSPREE_CLIENT_ID.
  if (!clientId) {
    failure.report(
      args,
      {
        code: 'LOGIN_UNAVAILABLE',
        message: `Client ID is not set. Cannot log in to ${endpoint}`,
        next: [
          {
            step: 'use_key',
            detail: 'Set FORMSPREE_API_KEY to an API key instead.',
          },
        ],
      },
      () =>
        log.error(
          `Client ID is not set. Cannot log in to ${log.variable(endpoint)}`,
        ),
    );
    return;
  }

  messages.usingEndpoint(endpoint, { stderr: args.json });

  if (args.complete) {
    await finish(args, endpoint);
  } else if (args.json) {
    await handOver(args, endpoint, clientId);
  } else {
    await login.logIn({
      endpoint,
      clientId,
      scope: args.scope || oauth.DEFAULT_SCOPE,
      openBrowser: args.browser,
    });
  }
};

export const command: Command<typeof builder> = {
  command: 'login',
  describe: 'Logs in to Formspree in your browser',
  builder: withExamples(builder, [
    ['$0 login', 'Opens the browser and waits for you to approve'],
    [
      '$0 login --json',
      'For an agent: prints the link for someone to approve, and returns',
    ],
    ['$0 login --complete', 'Finishes that login once it has been approved'],
  ]),
  handler,
};
