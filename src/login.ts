import chalk from 'chalk';
import * as api from './api.ts';
import * as browser from './browser.ts';
import * as credentials from './credentials.ts';
import type { Credentials } from './credentials.ts';
import * as failure from './failure.ts';
import type { Failure } from './failure.ts';
import * as log from './log.ts';
import type { Print } from './log.ts';
import * as oauth from './oauth.ts';
import type { DeviceCode, TokenResponse } from './oauth.ts';
import { OAuthError } from './oauth.ts';
import * as pending from './pending.ts';
import type { PendingLogin } from './pending.ts';
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

/** Why a login didn't happen, and a line on what to do about it. */
interface LoginFailure extends Failure {
  hint?: string;
}

const START_AGAIN = {
  step: 'start_again',
  detail: 'Start a new login.',
  command: 'formspree login',
} as const;

/** Why a login failed, as a failure to report. */
export const describe = (error: unknown, endpoint: string): LoginFailure => {
  switch (errorCode(error)) {
    case 'expired_token':
      return {
        code: 'LOGIN_EXPIRED',
        message: 'The login code expired',
        hint: `Run ${log.variable('formspree login')} to try again.`,
        next: [START_AGAIN],
      };

    case 'access_denied':
      return {
        code: 'LOGIN_DENIED',
        message: 'Login was denied in the browser',
        next: [START_AGAIN],
      };

    case 'rate_limited':
      return {
        code: 'LOGIN_FAILED',
        message: 'Too many login attempts',
        hint: 'Wait a minute, then try again.',
        retryable: true,
      };

    // The CLI's client id is unknown to the server: an old CLI after the
    // client was replaced, or a review app redeployed under development.
    case 'invalid_client':
      return {
        code: 'LOGIN_UNAVAILABLE',
        message: "Formspree didn't recognize this version of the CLI",
        hint: 'Update to the latest version, then try again.',
      };

    default:
      return {
        code: 'LOGIN_FAILED',
        message: `Login failed unexpectedly (${detail(error)} from ${endpoint})`,
      };
  }
};

/**
 * Reports why a login failed and sets the exit code: as JSON with --json,
 * else as an error with its hint. `print` is where the hint goes.
 */
export const reportFailure = (
  args: { json?: boolean | undefined },
  { hint, ...failed }: LoginFailure,
  print: Print = console.log,
): void => {
  failure.report(
    args,
    // With --json the hint is what the next steps already say.
    hint && !failed.next
      ? { ...failed, next: [{ step: 'fix', detail: hint }] }
      : failed,
    () => {
      log.error(failed.message);
      if (hint) log.meta(hint, print);
    },
  );
};

/**
 * Stores a login the device flow ended in, in place of any earlier one:
 * that one's grant is revoked rather than left live.
 */
const store = (
  endpoint: string,
  clientId: string,
  data: TokenResponse,
): Promise<Credentials | null> =>
  credentials.update(endpoint, async (previous) => {
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
    await store(endpoint, clientId, data);

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
    reportFailure({}, describe(error, endpoint), print);
    return false;
  }
};

/**
 * Starts a login for someone else to approve, and returns at once: what
 * an agent does, having no browser of its own. What `complete` needs to
 * finish it is kept on disk. Resolves with the link and the code to show
 * the person who'll approve. Rejects when the login can't be started.
 */
export const start = async ({
  endpoint,
  clientId,
  scope = oauth.DEFAULT_SCOPE,
}: {
  endpoint: string;
  clientId: string;
  scope?: string;
}): Promise<DeviceCode> => {
  const device = await oauth.requestDeviceCode({ endpoint, clientId, scope });

  pending.save(endpoint, {
    client_id: clientId,
    device_code: device.device_code,
    user_code: device.user_code,
    verification_uri_complete: device.verification_uri_complete,
    interval: device.interval,
    // RFC 8628 has no default; the server's codes last 15 minutes.
    expires_at: Date.now() + (device.expires_in ?? 900) * 1000,
  });
  return device;
};

/** How a login that was started earlier stands. */
export type Completion =
  | { status: 'logged_in'; login: Credentials | null }
  /** Not approved yet: `complete` can be run again. */
  | { status: 'pending'; waiting: PendingLogin }
  /** Nothing was started, or it was finished or given up on since. */
  | { status: 'none' }
  | { status: 'failed'; error: unknown };

/**
 * Finishes a login that `start` began, waiting up to `wait` seconds for
 * it to be approved. The approval is checked for at once, since it has
 * usually been given by the time this is run.
 */
export const complete = async ({
  endpoint,
  wait,
}: {
  endpoint: string;
  wait: number;
}): Promise<Completion> => {
  const waiting = pending.read(endpoint);
  if (!waiting) return { status: 'none' };

  const left = (waiting.expires_at - Date.now()) / 1000;
  if (left <= 0) {
    pending.clear(endpoint);
    return { status: 'failed', error: new OAuthError('expired_token') };
  }

  try {
    const data = await oauth.pollForToken({
      endpoint,
      clientId: waiting.client_id,
      deviceCode: waiting.device_code,
      interval: waiting.interval,
      expiresIn: Math.min(Math.max(0, wait), left),
      immediate: true,
    });
    const login = await store(endpoint, waiting.client_id, data);
    pending.clear(endpoint);
    return { status: 'logged_in', login };
  } catch (error) {
    // The wait ran out with the code still good: no status means it was
    // the polling that gave up, not the server.
    const gaveUp =
      error instanceof OAuthError &&
      error.code === 'expired_token' &&
      error.status === undefined &&
      Date.now() < waiting.expires_at;
    if (gaveUp) return { status: 'pending', waiting };

    // Denied or expired, the code is spent. Anything else may be a blip,
    // so the login is kept to try again.
    if (['access_denied', 'expired_token'].includes(errorCode(error) ?? '')) {
      pending.clear(endpoint);
    }
    return { status: 'failed', error };
  }
};
