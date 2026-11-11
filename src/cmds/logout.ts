import type { Argv } from 'yargs';
import { JSON_BY_DEFAULT } from '../agent.ts';
import type { Args, Command } from '../command.ts';
import { withExamples } from '../command.ts';
import * as credentials from '../credentials.ts';
import * as failure from '../failure.ts';
import * as log from '../log.ts';
import * as messages from '../messages.ts';
import * as oauth from '../oauth.ts';
import { OAuthError } from '../oauth.ts';

const builder = (yargs: Argv) =>
  yargs.option('json', {
    type: 'boolean',
    describe: `Print whether a login was removed, as JSON. ${JSON_BY_DEFAULT}`,
  });

const handler = async (args: Args<typeof builder>): Promise<void> => {
  const endpoint = oauth.endpoint();
  let found = false;
  let revokeFailed = false;

  messages.usingEndpoint(endpoint, { stderr: args.json });

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
    failure.report(args, {
      code: 'LOGOUT_FAILED',
      message: 'Logout failed unexpectedly',
    });
    return;
  }

  if (!found) {
    if (args.json) {
      console.log(JSON.stringify({ logged_out: false, endpoint }, null, 2));
    } else {
      log.meta(`Not logged in to ${endpoint}`);
    }
    return;
  }

  if (revokeFailed) {
    const fix =
      'Revoke "Formspree CLI" under Connected apps in your account settings.';
    failure.report(
      args,
      {
        code: 'REVOKE_FAILED',
        message: 'Logged out, but the login could not be revoked',
        next: [{ step: 'revoke_in_dashboard', detail: fix }],
        // The stored login is gone all the same.
        extra: { logged_out: true, endpoint },
      },
      () => {
        log.error('Logged out, but the login could not be revoked');
        log.meta(fix);
      },
    );
    return;
  }

  if (args.json) {
    console.log(JSON.stringify({ logged_out: true, endpoint }, null, 2));
  } else {
    log.success(`Logged out of ${endpoint}`);
  }
};

export const command: Command<typeof builder> = {
  command: 'logout',
  describe: 'Logs out and revokes the stored token',
  builder: withExamples(builder, [
    ['$0 logout', 'Revokes the login and removes it from this machine'],
  ]),
  handler,
};
