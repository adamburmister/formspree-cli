const chalk = require('chalk');
const log = require('../log');
const messages = require('../messages');
const oauth = require('../oauth');
const api = require('../api');

exports.command = 'whoami';
exports.describe = 'Shows the accounts you are logged in to';

exports.builder = yargs => {
  yargs.option('endpoint', {
    alias: 'e',
    describe: 'API endpoint'
  });

  yargs.option('key', {
    alias: 'k',
    describe: 'API key to use instead of your login (or set FORMSPREE_API_KEY)'
  });
};

exports.handler = async args => {
  const endpoint = oauth.normalizeEndpoint(args.endpoint);
  const key = api.apiKey(args.key);

  try {
    const response = await api.request(
      endpoint,
      {
        method: 'get',
        path: '/api/v1/accounts'
      },
      { key }
    );

    if (response.status !== 200) {
      log.error(`Request failed ${chalk.gray(`(${response.status})`)}`);
      process.exitCode = 1;
      return;
    }

    log.success(
      key ? `Using an API key for ${endpoint}` : `Logged in to ${endpoint}`
    );
    console.log('');
    response.data.accounts.forEach(account => {
      console.log(
        `  ${account.name || 'Personal account'} ${chalk.gray(
          `(${account.kind}, ${account.id})`
        )}`
      );
    });
    console.log('');
  } catch (error) {
    if (error instanceof api.LoginRequired) {
      messages.loginRequired(endpoint, error.message);
    } else if (error instanceof api.InvalidKey) {
      log.error(error.message);
      log.meta(
        `Check the ${log.variable('--key')} flag or the ${log.variable(
          'FORMSPREE_API_KEY'
        )} env variable.`
      );
    } else {
      log.error('Request failed unexpectedly');
    }
    process.exitCode = 1;
  }
};
