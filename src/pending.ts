import fs from 'node:fs';
import path from 'node:path';
import { configDir } from './credentials.ts';
import { errorCode } from './util.ts';

/**
 * A login that was started for someone to approve in their browser, kept
 * until `formspree login --complete` finishes it. It lives in a file, not
 * in what the command prints, because the device code is what turns the
 * approval into a login: it doesn't belong in a transcript.
 */
export interface PendingLogin {
  client_id: string;
  device_code: string;
  /** The code the approval page shows, for the person to check. */
  user_code: string;
  verification_uri_complete: string;
  /** Seconds between polls, as the server asked. */
  interval?: number | undefined;
  /** When the device code stops working, in milliseconds since the epoch. */
  expires_at: number;
}

type Entries = Record<string, PendingLogin>;

/** The pending logins: at most one per endpoint. */
const file = (): string => path.join(configDir(), 'pending-login.json');

const readAll = (): Entries => {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8')) as Entries;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return {};
    throw error;
  }
};

const writeAll = (entries: Entries): void => {
  fs.mkdirSync(path.dirname(file()), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file(), JSON.stringify(entries), { mode: 0o600 });
  // The mode above only applies to a file that's being created.
  fs.chmodSync(file(), 0o600);
};

/** The login waiting to be completed for an endpoint, or null. */
export const read = (endpoint: string): PendingLogin | null =>
  readAll()[endpoint] ?? null;

/** Keeps a login to complete later, in place of any earlier one. */
export const save = (endpoint: string, login: PendingLogin): void => {
  writeAll({ ...readAll(), [endpoint]: login });
};

/** Forgets the login waiting for an endpoint, if there is one. */
export const clear = (endpoint: string): void => {
  const { [endpoint]: gone, ...rest } = readAll();
  if (!gone) return;

  if (Object.keys(rest).length) {
    writeAll(rest);
  } else {
    fs.rmSync(file(), { force: true });
  }
};
