import { stripVTControlCharacters } from 'node:util';
import * as log from './log.ts';

/**
 * How a command ended, as its exit code. A script or an agent can tell
 * these apart without reading the message.
 */
export const EXIT = {
  /** Anything not listed below: the API refused, or something broke. */
  failure: 1,
  /** The command line can't be used as given: fix it and run again. */
  usage: 2,
  /** The API has nothing with that id, or this credential can't see it. */
  notFound: 3,
  /** No login or key, or one the API won't take. */
  auth: 4,
  /** Stopped with Ctrl+C. */
  interrupted: 130,
} as const;

/**
 * Why the CLI itself failed a command: a stable name to branch on. What
 * the API refuses carries the API's own code instead.
 */
export type Reason =
  // The command line: exit code 2.
  | 'INVALID_USAGE'
  | 'MISSING_ARGUMENT'
  | 'CONFIRMATION_REQUIRED'
  | 'INVALID_INPUT'
  | 'NO_PENDING_LOGIN'
  // The credential: exit code 4.
  | 'NOT_LOGGED_IN'
  | 'INVALID_KEY'
  | 'DEPLOY_KEY_REQUIRED'
  | 'INVALID_DEPLOY_KEY'
  // Everything else: exit code 1.
  | 'REQUEST_FAILED'
  | 'ALREADY_EXISTS'
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'DEPLOY_FAILED'
  | 'LOGOUT_FAILED'
  | 'REVOKE_FAILED'
  | 'NO_DASHBOARD_LINK'
  | 'LOGIN_PENDING'
  | 'LOGIN_EXPIRED'
  | 'LOGIN_DENIED'
  | 'LOGIN_FAILED'
  | 'LOGIN_UNAVAILABLE'
  | 'UNEXPECTED';

const USAGE: ReadonlySet<Reason> = new Set([
  'INVALID_USAGE',
  'MISSING_ARGUMENT',
  'CONFIRMATION_REQUIRED',
  'INVALID_INPUT',
  'NO_PENDING_LOGIN',
]);
const AUTH: ReadonlySet<Reason> = new Set([
  'NOT_LOGGED_IN',
  'INVALID_KEY',
  'DEPLOY_KEY_REQUIRED',
  'INVALID_DEPLOY_KEY',
]);

/**
 * Something to do about a failure. `command` is there when the step is a
 * command to run as it stands. It never repeats what was typed, so no
 * key given on the command line can end up in it. `url` is a page for a
 * person to open.
 */
export interface Step {
  step: string;
  detail: string;
  command?: string;
  url?: string;
}

/** A failure the CLI reports itself, as opposed to one the API reported. */
export interface Failure {
  code: Reason;
  message: string;
  next?: readonly Step[];
  /** Whether the same command can succeed later, unchanged. */
  retryable?: boolean;
  /** More to put in the JSON, like a deploy's list of errors. */
  extra?: Record<string, unknown>;
}

/** The exit code for a failure the CLI reports itself. */
export const exitFor = (code: Reason): number => {
  if (USAGE.has(code)) return EXIT.usage;
  if (AUTH.has(code)) return EXIT.auth;
  return EXIT.failure;
};

/** The exit code for a response the API refused with. */
export const exitForStatus = (status: number): number => {
  if (status === 401) return EXIT.auth;
  if (status === 404) return EXIT.notFound;
  return EXIT.failure;
};

/**
 * A failure as --json prints it. It has the fields of the API's problems
 * that a caller branches on (`ok`, `error.code`, `detail`, `retryable`,
 * `next_steps`), so one reader handles both.
 */
export const body = ({
  code,
  message,
  next = [],
  retryable = false,
  extra = {},
}: Failure): Record<string, unknown> => {
  // A message written for the terminal may be colored. JSON isn't.
  const plain = stripVTControlCharacters(message);

  return {
    ok: false,
    error: { code, message: plain },
    detail: plain,
    retryable,
    ...extra,
    ...(next.length ? { next_steps: next } : {}),
  };
};

/**
 * Reports a failure and sets the exit code. With --json it goes to stdout
 * as JSON, where a refusal from the API goes too. Without, `human` says
 * it, or failing that the message is printed as an error.
 */
export const report = (
  args: { json?: boolean | undefined },
  failure: Failure,
  human?: () => void,
): void => {
  process.exitCode = exitFor(failure.code);

  if (args.json) {
    console.log(JSON.stringify(body(failure), null, 2));
  } else if (human) {
    human();
  } else {
    log.error(failure.message);
  }
};

/** Thrown for input the CLI can't use, before anything is sent. */
export class UsageError extends Error {
  readonly code: Reason;
  readonly next: readonly Step[];

  constructor(
    message: string,
    {
      code = 'INVALID_USAGE',
      next = [],
    }: { code?: Reason; next?: readonly Step[] } = {},
  ) {
    super(message);
    this.name = 'UsageError';
    this.code = code;
    this.next = next;
  }
}
