import fs from 'node:fs';
import chalk from 'chalk';
import type { Argv } from 'yargs';
import * as api from './api.ts';
import * as failure from './failure.ts';
import type { Failure } from './failure.ts';
import { UsageError } from './failure.ts';
import type { ApiRequest, ApiResponse } from './api.ts';
import * as log from './log.ts';
import { logIn } from './login.ts';
import * as messages from './messages.ts';
import * as oauth from './oauth.ts';
import * as prompt from './prompt.ts';
import type { NextStep, Problem } from './types.ts';
import { errorCode, isObject } from './util.ts';

export { UsageError } from './failure.ts';

/**
 * Thrown to end a command early, once why has been said and the exit code
 * set: a login that was offered and turned down, or that didn't work.
 */
export class Stopped extends Error {
  constructor() {
    super('Stopped');
    this.name = 'Stopped';
  }
}

/** What every command that calls /api/v1 is given. */
export interface CommonArgs {
  key?: string | undefined;
  json?: boolean | undefined;
}

/** The options every command that calls /api/v1 takes. */
export const options = <T>(yargs: Argv<T>) =>
  yargs
    .option('key', {
      alias: 'k',
      type: 'string',
      describe:
        'API key to use instead of your login (or set FORMSPREE_API_KEY)',
    })
    .option('json', {
      type: 'boolean',
      describe: 'Print the API response as JSON',
    });

/** The option for the creates that honor an Idempotency-Key. */
export const idempotencyOption = <T>(yargs: Argv<T>) =>
  yargs.option('idempotency-key', {
    type: 'string',
    describe:
      'Makes a retry safe: the same key within 24 hours returns the first result instead of creating again',
  });

/** The option for the creates that ask for what they weren't given. */
export const interactiveOption = <T>(yargs: Argv<T>) =>
  yargs.option('interactive', {
    type: 'boolean',
    describe:
      'Ask for the values when no options are given. On in a terminal; turn off with --no-interactive',
  });

/**
 * Whether a create should ask for its values: none of the options that
 * say what the new thing is were passed, and someone is there to answer.
 * --json and --no-interactive turn it off, as does a script's stdin.
 * Options that only say where it goes (a project, an account) aren't in
 * `contents`: they answer their own question and leave the rest to be
 * asked.
 *
 * @param contents The values of the options that say what is created
 */
export const asks = (
  args: { interactive?: boolean | undefined; json?: boolean | undefined },
  contents: readonly unknown[],
): boolean =>
  args.interactive !== false &&
  !args.json &&
  prompt.interactive() &&
  contents.every((value) => value === undefined);

export const idempotencyHeaders = (args: {
  idempotencyKey?: string | undefined;
}): Record<string, string> | undefined =>
  args.idempotencyKey ? { 'Idempotency-Key': args.idempotencyKey } : undefined;

/**
 * Whether the response repeats an earlier request with the same
 * Idempotency-Key, so nothing new was created.
 */
export const replayed = (response: ApiResponse): boolean =>
  String(response.headers?.['idempotent-replayed']).toLowerCase() === 'true';

/** Writes an indented line to stderr. */
const detail = (line: string): void => {
  console.error(`  ${line}`);
};

/**
 * Prints the steps a response says are left, in a box. `rewrite` maps a
 * step's name to a line that replaces the server's, which is written for
 * API callers, or to null to leave the step out. With `linkedOnly`, steps
 * without a link are left out. With `stderr` the box goes there, for the
 * steps that come with an error.
 */
export const nextSteps = (
  steps: readonly NextStep[] | undefined,
  {
    rewrite = {},
    linkedOnly = false,
    stderr = false,
  }: {
    rewrite?: Record<string, string | null>;
    linkedOnly?: boolean;
    stderr?: boolean;
  } = {},
): void => {
  const shown = (steps ?? []).filter(
    (step) => rewrite[step.step] !== null && (!linkedOnly || step.url),
  );
  if (!shown.length) return;

  const lines = shown.flatMap((step) => {
    const replacement = rewrite[step.step];
    if (replacement) return [`- ${replacement}`];
    return [
      `- ${step.detail}`,
      ...(step.url ? [`  ${chalk.cyan(step.url)}`] : []),
    ];
  });
  prompt.box(lines.join('\n'), 'Next steps', { stderr });
  (stderr ? console.error : console.log)('');
};

/**
 * Says why the API refused a request. v1 answers with an RFC 9457 problem;
 * a few older errors are still { ok: false, error }.
 */
const reportProblem = (response: ApiResponse): void => {
  const body: Problem = isObject(response.data) ? response.data : {};
  const legacy = isObject(body.error) ? body.error.message : body.error;
  const reason = body.detail || legacy || 'Request failed';
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const accounts = Array.isArray(body.accounts) ? body.accounts : [];

  log.error(`${reason} ${chalk.gray(`(${response.status})`)}`);
  if (!errors.length && !accounts.length && !body.next_steps) return;
  console.error('');

  for (const error of errors) {
    const allowed = Array.isArray(error.allowed)
      ? chalk.gray(` (allowed: ${error.allowed.join(', ')})`)
      : '';
    const path = error.path ? `${log.variable(error.path)}: ` : '';
    detail(`${path}${error.message}${allowed}`);
  }
  if (errors.length) console.error('');

  if (accounts.length) {
    for (const account of accounts) {
      detail(
        `${account.name || 'Personal account'} ${chalk.gray(`(${account.id})`)}`,
      );
    }
    console.error('');
    detail(`Pick one with ${log.variable('--account <id>')}`);
    console.error('');
  }

  nextSteps(body.next_steps, { linkedOnly: true, stderr: true });
};

/** What there is to do about having no login the API will take. */
const notLoggedIn = (reason: string): Failure => ({
  code: 'NOT_LOGGED_IN',
  message: reason,
  next: [
    {
      step: 'log_in',
      detail:
        'Run formspree login and approve it in the browser, or set FORMSPREE_API_KEY to an API key.',
      command: 'formspree login',
    },
  ],
});

/**
 * Reports a request that got no answer from the API to act on: there was
 * no credential to send, the key was refused, or the request failed.
 */
const reportFailure = (
  args: CommonArgs,
  error: unknown,
  endpoint: string,
): void => {
  if (error instanceof api.LoginRequired) {
    failure.report(args, notLoggedIn(error.message), () =>
      messages.loginRequired(error.message),
    );
  } else if (error instanceof api.InvalidKey) {
    const fix = 'Check the --key flag or the FORMSPREE_API_KEY env variable.';
    failure.report(
      args,
      {
        code: 'INVALID_KEY',
        message: error.message,
        next: [{ step: 'check_key', detail: fix }],
      },
      () => {
        log.error(error.message);
        detail(
          `Check the ${log.variable('--key')} flag or the ${log.variable(
            'FORMSPREE_API_KEY',
          )} env variable.`,
        );
      },
    );
  } else {
    const cause =
      errorCode(error) ?? (error instanceof Error ? error.message : 'error');
    failure.report(
      args,
      {
        code: 'REQUEST_FAILED',
        message: `Request failed unexpectedly (${cause} from ${endpoint})`,
        // Nothing reached the API, or nothing came back: worth another try.
        retryable: true,
      },
      () =>
        log.error(
          `Request failed unexpectedly ${chalk.gray(`(${cause} from ${endpoint})`)}`,
        ),
    );
  }
};

/** The 401 a refused credential's error carries, if it has a body. */
const refusal = (error: unknown): unknown =>
  error instanceof api.LoginRequired || error instanceof api.InvalidKey
    ? error.response?.data
    : undefined;

/**
 * Reports a response the API refused, and sets the exit code from its
 * status. With --json its body goes to stdout as it came, so a script
 * gets the problem's `errors` and `next_steps`. A refusal with no JSON
 * body, like a proxy's error page, is reported as the CLI's own failures
 * are.
 */
export const refused = (args: CommonArgs, response: ApiResponse): void => {
  if (!args.json) {
    reportProblem(response);
  } else if (isObject(response.data)) {
    console.log(JSON.stringify(response.data, null, 2));
  } else {
    failure.report(args, {
      code: 'REQUEST_FAILED',
      message: `Request failed (${response.status})`,
      retryable: response.status >= 500,
      extra: { status: response.status },
    });
  }
  process.exitCode = failure.exitForStatus(response.status);
};

/**
 * Offers to log in, for a command that found no login it can use, then
 * logs in. Resolves with true once there's a login to send the request
 * with, and with false when it's not the place to ask: with --json, off a
 * terminal, or on a server the CLI has no client id for. A login that's
 * turned down, or that fails, ends the command.
 */
const offerLogin = async (
  args: CommonArgs,
  error: api.LoginRequired,
  endpoint: string,
): Promise<boolean> => {
  const clientId = oauth.clientIdFor(endpoint);
  if (args.json || !prompt.interactive() || !clientId) return false;

  const agreed = await prompt.session((p) =>
    p.confirm({ message: `${error.message}. Log in now?`, initialValue: true }),
  );
  if (!agreed) {
    messages.loginRequired(error.message);
    process.exitCode = failure.EXIT.auth;
    throw new Stopped();
  }

  // On stderr, with the question: stdout is the command's own output.
  if (!(await logIn({ endpoint, clientId, stderr: true }))) {
    throw new Stopped();
  }
  return true;
};

let announced: string | null = null;

/**
 * Sends a v1 request with the API key or stored login, or with no
 * credential when `anonymous`. Resolves with the response when it's a 2xx.
 * Anything else is reported, the exit code is set, and it resolves with
 * null.
 *
 * In a terminal, a request that finds no login it can use offers to log
 * in first, and is sent once that's done. Turning the login down ends the
 * command: it rejects with Stopped, which `run` takes care of.
 *
 * An `optional` request is one the command can do without: when it fails
 * it resolves with null and nothing else happens.
 *
 * `settled` is called once the request is over, with the response or with
 * null, before anything is reported: the moment to stop a spinner.
 *
 * `accept` names a refusal the command handles itself: a response it
 * returns true for is resolved with like a 2xx, and nothing is reported.
 *
 * `quiet` keeps stdout for what the command prints itself, as --json
 * does: the note about which server is in use goes to stderr.
 *
 * `asksToLogIn: false` is for a command whose answer is whether there's a
 * login: it reports that there's none, without offering one.
 */
export const call = async <T>(
  args: CommonArgs,
  request: ApiRequest,
  {
    anonymous = false,
    optional = false,
    settled,
    accept,
    quiet = false,
    asksToLogIn = true,
  }: {
    anonymous?: boolean;
    optional?: boolean;
    settled?: ((response: ApiResponse<T> | null) => void) | undefined;
    accept?: ((response: ApiResponse) => boolean) | undefined;
    quiet?: boolean;
    asksToLogIn?: boolean;
  } = {},
): Promise<ApiResponse<T> | null> => {
  const endpoint = oauth.endpoint();
  let response: ApiResponse<T>;

  // Once per command, however many requests it sends.
  if (announced !== endpoint) {
    messages.usingEndpoint(endpoint, { stderr: args.json || quiet });
    announced = endpoint;
  }

  const send = (): Promise<ApiResponse<T>> =>
    anonymous
      ? api.anonymous<T>(endpoint, request)
      : api.request<T>(endpoint, request, { key: api.apiKey(args.key) });

  try {
    try {
      response = await send();
    } catch (error) {
      // With `settled` a spinner is running: no place for a question.
      const offered =
        error instanceof api.LoginRequired &&
        asksToLogIn &&
        !settled &&
        (await offerLogin(args, error, endpoint));
      if (!offered) throw error;
      response = await send();
    }
  } catch (error) {
    if (error instanceof Stopped || error instanceof prompt.Cancelled) {
      throw error;
    }
    if (optional) return null;
    settled?.(null);
    // A refused credential is the API's answer too: with --json it goes
    // to stdout like any other refusal.
    const body = refusal(error);
    if (args.json && isObject(body)) {
      process.exitCode = failure.EXIT.auth;
      console.log(JSON.stringify(body, null, 2));
    } else {
      reportFailure(args, error, endpoint);
    }
    return null;
  }

  const succeeded = response.status >= 200 && response.status < 300;
  if (succeeded || accept?.(response)) {
    settled?.(response);
    return response;
  }
  if (optional) return null;

  settled?.(null);
  refused(args, response);
  return null;
};

/** Prints a successful response: as JSON with --json, else with `render`. */
export const print = <T>(
  args: CommonArgs,
  response: ApiResponse<T>,
  render: (data: T) => void,
): void => {
  if (args.json) {
    console.log(JSON.stringify(response.data, null, 2));
  } else {
    render(response.data);
  }
};

/**
 * Wraps a command's handler, reporting input the CLI can't use and a
 * prompt that was abandoned.
 */
export const run =
  <A>(handler: (args: A) => Promise<void>) =>
  async (args: A): Promise<void> => {
    try {
      await handler(args);
    } catch (error) {
      if (error instanceof prompt.Cancelled) {
        // The prompt has already said so.
        process.exitCode = 130;
      } else if (error instanceof Stopped) {
        // So has whatever stopped the command.
        process.exitCode ??= 1;
      } else if (error instanceof UsageError) {
        failure.report(args as CommonArgs, {
          code: error.code,
          message: error.message,
          next: error.next,
        });
      } else {
        throw error;
      }
    }
  };

/** Reads a JSON object from a file, or from stdin when there's no path. */
export const readJson = (file?: string): Record<string, unknown> => {
  const name = file || 'The input';
  let text: string;
  try {
    text = fs.readFileSync(file || 0, 'utf8');
  } catch {
    throw new UsageError(`${name} could not be read`, {
      code: 'INVALID_INPUT',
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UsageError(`${name} is not valid JSON`, {
      code: 'INVALID_INPUT',
    });
  }
  if (!isObject(parsed)) {
    throw new UsageError(`${name} must hold a JSON object`, {
      code: 'INVALID_INPUT',
    });
  }
  return parsed;
};

/**
 * The JSON object a command was given with --from or --stdin, else an
 * empty one.
 */
export const input = (args: {
  from?: string | undefined;
  stdin?: boolean | undefined;
}): Record<string, unknown> => {
  if (args.stdin) return readJson();
  return args.from ? readJson(args.from) : {};
};

type Cell = string | readonly string[] | null | undefined | false;

/** Labels with their values, for `table` and `rows`. */
export type Pairs = ReadonlyArray<readonly [label: string, value: Cell]>;

/**
 * Lays label and value pairs out in two columns, a line each, skipping
 * empty values. A value can be an array of lines.
 */
export const table = (pairs: Pairs): string[] => {
  const shown = pairs
    .map(([label, value]) => [label, value ? [value].flat() : []] as const)
    .filter(([, lines]) => lines.length);
  const width = Math.max(0, ...shown.map(([label]) => label.length));

  return shown.flatMap(([label, lines]) =>
    lines.map((line, i) => {
      const head = (i === 0 ? label : '').padEnd(width);
      return `${chalk.gray(head)}  ${line}`;
    }),
  );
};

/** Prints label and value pairs as a table, indented, then a blank line. */
export const rows = (pairs: Pairs): void => {
  const lines = table(pairs);
  for (const line of lines) console.log(`  ${line}`);
  if (lines.length) console.log('');
};

/** A path segment for an id the user typed. */
export const segment = (id: string): string => encodeURIComponent(id);
