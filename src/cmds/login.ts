import type { Argv } from 'yargs';
import type { Args, Command } from '../command.ts';
import * as log from '../log.ts';
import { logIn } from '../login.ts';
import * as messages from '../messages.ts';
import * as oauth from '../oauth.ts';

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
    // Declared only so `login --key` (or `-k`) is caught, not silently
    // ignored.
    .option('key', {
      alias: 'k',
      type: 'string',
      hidden: true,
    });

const handler = async (args: Args<typeof builder>): Promise<void> => {
  const endpoint = oauth.endpoint();
  const clientId = oauth.clientIdFor(endpoint);
  const scope = args.scope || oauth.DEFAULT_SCOPE;

  if (args.key) {
    log.error("API keys don't need a login");
    log.meta(
      `Pass ${log.variable(
        '--key',
      )} to the command itself, or set the ${log.variable(
        'FORMSPREE_API_KEY',
      )} env variable.`,
    );
    process.exitCode = 1;
    return;
  }

  // No client id: production's isn't set yet, or a development endpoint
  // without FORMSPREE_CLIENT_ID.
  if (!clientId) {
    log.error(
      `Client ID is not set. Cannot log in to ${log.variable(endpoint)}`,
    );
    process.exitCode = 1;
    return;
  }

  messages.usingEndpoint(endpoint);

  await logIn({ endpoint, clientId, scope, openBrowser: args.browser });
};

export const command: Command<typeof builder> = {
  command: 'login',
  describe: 'Logs in to Formspree in your browser',
  builder,
  handler,
};
