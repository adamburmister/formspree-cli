import chalk from 'chalk';
import * as api from './api.ts';
import * as browser from './browser.ts';
import * as credentials from './credentials.ts';
import * as log from './log.ts';
import type { Print } from './log.ts';
import * as oauth from './oauth.ts';
import { OAuthError } from './oauth.ts';
import * as spin from './spinner.ts';
import { errorCode } from './util.ts';

/**
 * What went wrong, for an unexpected failure: the HTTP status and any OAuth
 * error code, or a network error's code (ECONNREFUSED, say).
 */
const detail = (error: unknown): string => {
  if (error instanceof OAuthError && error.status) {
    return error.code === 'server_error'
      ? `HTTP ${error.status}`
      : `HTTP ${error.status}, ${error.code}`;
  }
  return errorCode(error) ?? (error instanceof Error ? error.message : 'error');
};

const printError = (error: unknown, endpoint: string, print: Print): void => {
  switch (errorCode(error)) {
    case 'expired_token':
      log.error('The login code expired');
      log.meta(`Run ${log.variable('formspree login')} to try again.`, print);
      return;

    case 'access_denied':
      log.error('Login was denied in the browser');
      return;

    case 'rate_limited':
      log.error('Too many login attempts');
      log.meta('Wait a minute, then try again.', print);
      return;

    // The CLI's client id is unknown to the server: an old CLI after the
    // client was replaced, or a review app redeployed under development.
    case 'invalid_client':
      log.error("Formspree didn't recognize this version of the CLI");
      log.meta('Update to the latest version, then try again.', print);
      return;

    default:
      log.error(
        `Login failed unexpectedly (${detail(error)} from ${endpoint})`,
      );
  }
};

/**
 * Logs in with the OAuth device flow: shows the link, opens it in the
 * browser, waits for it to be approved there, and stores the login.
 * Resolves with whether that worked. When it didn't, why has been reported
 * and the exit code set.
 *
 * With `stderr` its lines go to stderr. A command that logs in on the way
 * to something else asks for that, so its own output stays alone on
 * stdout.
 *
 * The link is opened only where there's a browser to open it in, and not
 * at all when `openBrowser` is false. It's printed either way.
 */
export const logIn = async ({
  endpoint,
  clientId,
  scope = oauth.DEFAULT_SCOPE,
  stderr = false,
  openBrowser = true,
}: {
  endpoint: string;
  clientId: string;
  scope?: string;
  stderr?: boolean;
  openBrowser?: boolean;
}): Promise<boolean> => {
  const print: Print = stderr ? console.error : console.log;
  const opens =
    openBrowser && browser.available(stderr ? process.stderr : process.stdout);
  let spinner: ReturnType<typeof spin.start> | undefined;

  try {
    const device = await oauth.requestDeviceCode({ endpoint, clientId, scope });

    const link = device.verification_uri_complete;
    log.progress(
      opens
        ? 'Opening this link in your browser to log in:'
        : 'Open this link in your browser to log in:',
      print,
    );
    print('');
    print(`  ${chalk.cyan(link)}`);
    print('');
    if (opens && !(await browser.open(link))) {
      log.meta("The browser didn't open. Open the link yourself.", print);
    }
    log.meta(
      `Check that it shows the code ${log.variable(device.user_code)}`,
      print,
    );

    spinner = spin.start('Waiting for you to approve in the browser');

    const data = await oauth.pollForToken({
      endpoint,
      clientId,
      deviceCode: device.device_code,
      interval: device.interval,
      expiresIn: device.expires_in,
    });

    spinner.clear();

    await credentials.update(endpoint, async (previous) => {
      // Replacing a login: revoke the old grant rather than leave it live.
      if (previous) {
        await oauth
          .revokeToken({
            endpoint,
            clientId: previous.client_id,
            token: previous.refresh_token,
          })
          .catch(() => {});
      }
      return oauth.toCredentials(data, clientId);
    });

    log.success('Logged in', print);

    // A key in the environment beats any login, so this one goes unused.
    if (api.apiKey()) {
      log.meta(
        `${log.variable(
          'FORMSPREE_API_KEY',
        )} is set, so commands use that key instead of this login. Unset it to use the login.`,
        print,
      );
    }
    return true;
  } catch (error) {
    spinner?.clear();
    printError(error, endpoint, print);
    process.exitCode = 1;
    return false;
  }
};
