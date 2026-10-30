const chalk = require('chalk');
const ora = require('ora');
const log = require('../log');
const messages = require('../messages');
const oauth = require('../oauth');
const credentials = require('../credentials');
const api = require('../api');

const printError = (error, { clientId }) => {
  switch (error.code) {
    case 'expired_token':
      log.error('The login code expired');
      log.meta(`Run ${log.variable('formspree login')} to try again.`);
      return;

    case 'access_denied':
      log.error('Login was denied in the browser');
      return;

    case 'rate_limited':
      log.error('Too many login attempts');
      log.meta('Wait a minute, then try again.');
      return;

    case 'invalid_client':
      log.error(`OAuth client ${log.variable(clientId)} was not recognized`);
      log.meta(
        `Check the ${log.variable(
          'FORMSPREE_CLIENT_ID'
        )} env variable or the ${log.variable('--client-id')} flag.`
      );
      return;

    default:
      log.error('Login failed unexpectedly');
      return;
  }
};

exports.command = 'login';
exports.describe = 'Logs in to Formspree in your browser';

exports.builder = yargs => {
  yargs.option('endpoint', {
    alias: 'e',
    describe: 'API endpoint'
  });

  // For development against other servers; hidden from --help.
  yargs.option('client-id', {
    describe: 'OAuth client id',
    hidden: true
  });

  yargs.option('scope', {
    describe: 'Space-separated scopes to request',
    default: oauth.DEFAULT_SCOPE
  });

  // Declared only so `login --key` (or `-k`) is caught, not silently ignored.
  yargs.option('key', {
    alias: 'k',
    hidden: true
  });
};

exports.handler = async args => {
  const endpoint = oauth.normalizeEndpoint(args.endpoint);
  const clientId = oauth.clientIdFor(endpoint, args.clientId);
  const scope = args.scope || oauth.DEFAULT_SCOPE;
  const spinner = ora(
    chalk.gray('Waiting for you to approve in the browser...')
  );

  if (args.key) {
    log.error("API keys don't need a login");
    log.meta(
      `Pass ${log.variable(
        '--key'
      )} to the command itself, or set the ${log.variable(
        'FORMSPREE_API_KEY'
      )} env variable.`
    );
    process.exitCode = 1;
    return;
  }

  if (!clientId) {
    messages.clientIdRequired(endpoint);
    process.exitCode = 1;
    return;
  }

  try {
    const device = await oauth.requestDeviceCode({ endpoint, clientId, scope });

    log.progress('Open this link in your browser to log in:');
    console.log('');
    console.log(`  ${chalk.cyan(device.verification_uri_complete)}`);
    console.log('');
    log.meta(`Check that it shows the code ${log.variable(device.user_code)}`);

    spinner.start();

    const data = await oauth.pollForToken({
      endpoint,
      clientId,
      deviceCode: device.device_code,
      interval: device.interval,
      expiresIn: device.expires_in
    });

    spinner.stop();

    await credentials.update(endpoint, async previous => {
      // Replacing a login: revoke the old grant rather than leave it live.
      if (previous) {
        await oauth
          .revokeToken({
            endpoint,
            clientId: previous.client_id,
            token: previous.refresh_token
          })
          .catch(() => {});
      }
      return oauth.toCredentials(data, clientId);
    });

    log.success('Logged in');

    // A key in the environment beats any login, so this one goes unused.
    if (api.apiKey()) {
      log.meta(
        `${log.variable(
          'FORMSPREE_API_KEY'
        )} is set, so commands use that key instead of this login. Unset it to use the login.`
      );
    }
  } catch (error) {
    spinner.stop();
    printError(error, { clientId });
    process.exitCode = 1;
  }
};
