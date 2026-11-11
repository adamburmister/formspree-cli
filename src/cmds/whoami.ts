import chalk from 'chalk';
import type { Argv } from 'yargs';
import * as accounts from '../accounts.ts';
import * as api from '../api.ts';
import type { Args, Command } from '../command.ts';
import { withExamples } from '../command.ts';
import * as log from '../log.ts';
import * as oauth from '../oauth.ts';
import type { AccountsResponse } from '../types.ts';
import * as v1 from '../v1.ts';

const builder = (yargs: Argv) => v1.options(yargs);

const handler = v1.run(async (args: Args<typeof builder>) => {
  // Whether there's a login is the answer here, so none is offered.
  const response = await v1.call<AccountsResponse>(
    args,
    { method: 'get', path: '/api/v1/accounts' },
    { asksToLogIn: false },
  );
  if (!response) return;

  const endpoint = oauth.endpoint();
  const credential = api.apiKey(args.key) ? 'api_key' : 'login';

  if (args.json) {
    // The API's answer, with what only the CLI knows: which server it's
    // talking to, and what it's signing requests with.
    console.log(
      JSON.stringify({ endpoint, credential, ...response.data }, null, 2),
    );
    return;
  }

  log.success(
    credential === 'api_key'
      ? `Using an API key for ${endpoint}`
      : `Logged in to ${endpoint}`,
  );
  console.log('');
  for (const account of response.data.accounts) {
    console.log(
      `  ${accounts.name(account)} ${chalk.gray(
        `(${account.kind}, ${account.id})`,
      )}`,
    );
  }
  console.log('');
});

export const command: Command<typeof builder> = {
  command: 'whoami',
  describe: 'Shows the accounts you are logged in to',
  builder: withExamples(builder, [
    ['$0 whoami', 'Lists the accounts the login or key can use'],
    [
      '$0 whoami --json',
      'As JSON, with the server and the kind of credential in use',
    ],
  ]),
  handler,
};
