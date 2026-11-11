import chalk from 'chalk';
import type { Argv } from 'yargs';
import * as api from '../api.ts';
import type { Args, Command } from '../command.ts';
import * as log from '../log.ts';
import * as messages from '../messages.ts';
import * as oauth from '../oauth.ts';
import type { AccountsResponse } from '../types.ts';

const builder = (yargs: Argv) =>
  yargs.option('key', {
    alias: 'k',
    type: 'string',
    describe: 'API key to use instead of your login (or set FORMSPREE_API_KEY)',
  });

const handler = async (args: Args<typeof builder>): Promise<void> => {
  const endpoint = oauth.endpoint();
  const key = api.apiKey(args.key);

  messages.usingEndpoint(endpoint);

  try {
    const response = await api.request<AccountsResponse>(
      endpoint,
      { method: 'get', path: '/api/v1/accounts' },
      { key },
    );

    if (response.status !== 200) {
      log.error(`Request failed ${chalk.gray(`(${response.status})`)}`);
      process.exitCode = 1;
      return;
    }

    log.success(
      key ? `Using an API key for ${endpoint}` : `Logged in to ${endpoint}`,
    );
    console.log('');
    for (const account of response.data.accounts) {
      console.log(
        `  ${account.name || 'Personal account'} ${chalk.gray(
          `(${account.kind}, ${account.id})`,
        )}`,
      );
    }
    console.log('');
  } catch (error) {
    if (error instanceof api.LoginRequired) {
      messages.loginRequired(error.message);
    } else if (error instanceof api.InvalidKey) {
      log.error(error.message);
      log.meta(
        `Check the ${log.variable('--key')} flag or the ${log.variable(
          'FORMSPREE_API_KEY',
        )} env variable.`,
      );
    } else {
      log.error('Request failed unexpectedly');
    }
    process.exitCode = 1;
  }
};

export const command: Command<typeof builder> = {
  command: 'whoami',
  describe: 'Shows the accounts you are logged in to',
  builder,
  handler,
};
