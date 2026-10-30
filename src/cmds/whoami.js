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
};

exports.handler = async args => {
  const endpoint = oauth.normalizeEndpoint(args.endpoint);

  try {
    const response = await api.request(endpoint, {
      method: 'get',
      path: '/api/v1/accounts'
    });

    if (response.status !== 200) {
      log.error(`Request failed ${chalk.gray(`(${response.status})`)}`);
      process.exitCode = 1;
      return;
    }

    log.success(`Logged in to ${endpoint}`);
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
    } else {
      log.error('Request failed unexpectedly');
    }
    process.exitCode = 1;
  }
};
