import type { CommandModule } from 'yargs';
import * as credentials from '../credentials.ts';
import * as log from '../log.ts';
import * as messages from '../messages.ts';
import * as oauth from '../oauth.ts';
import { OAuthError } from '../oauth.ts';

const handler = async (): Promise<void> => {
  const endpoint = oauth.endpoint();
  let found = false;
  let revokeFailed = false;

  messages.usingEndpoint(endpoint);

  try {
    // Revoke under the lock, so a concurrent refresh can't rotate the
    // refresh token out from under the revoke.
    await credentials.update(endpoint, async (current) => {
      if (!current) return current;
      found = true;

      try {
        await oauth.revokeToken({
          endpoint,
          clientId: current.client_id,
          token: current.refresh_token,
        });
      } catch (error) {
        // invalid_grant: the grant was already revoked or expired.
        revokeFailed = !(
          error instanceof OAuthError && error.code === 'invalid_grant'
        );
      }

      return null;
    });
  } catch {
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
      'Revoke "Formspree CLI" under Connected apps in your account settings.',
    );
    process.exitCode = 1;
    return;
  }

  log.success(`Logged out of ${endpoint}`);
};

export const command: CommandModule = {
  command: 'logout',
  describe: 'Logs out and revokes the stored token',
  handler,
};
