const log = require('../log');
const oauth = require('../oauth');
const credentials = require('../credentials');

exports.command = 'logout';
exports.describe = 'Logs out and revokes the stored token';

exports.builder = yargs => {
  yargs.option('endpoint', {
    alias: 'e',
    describe: 'API endpoint'
  });
};

exports.handler = async args => {
  const endpoint = oauth.normalizeEndpoint(args.endpoint);
  let found = false;
  let revokeFailed = false;

  try {
    // Revoke under the lock, so a concurrent refresh can't rotate the
    // refresh token out from under the revoke.
    await credentials.update(endpoint, async current => {
      if (!current) return current;
      found = true;

      try {
        await oauth.revokeToken({
          endpoint,
          clientId: current.client_id,
          token: current.refresh_token
        });
      } catch (error) {
        // invalid_grant: the grant was already revoked or expired.
        revokeFailed = error.code !== 'invalid_grant';
      }

      return null;
    });
  } catch (error) {
    log.error('Logout failed unexpectedly');
    process.exitCode = 1;
    return;
  }

  if (!found) {
    log.meta(`Not logged in to ${endpoint}`);
    return;
  }

  if (revokeFailed) {
    log.error('Logged out, but the login could not be revoked');
    log.meta(
      'Revoke "Formspree CLI" under Connected apps in your account settings.'
    );
    process.exitCode = 1;
    return;
  }

  log.success(`Logged out of ${endpoint}`);
};
