import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { errorCode, sleep } from './util.ts';

/** A stored login for one endpoint. */
export interface Credentials {
  client_id: string;
  access_token: string;
  refresh_token: string;
  /** When the access token expires, in milliseconds since the epoch. */
  expires_at: number;
  scope?: string;
}

type Entries = Record<string, Credentials>;

/**
 * The directory holding the CLI's files: $FORMSPREE_CONFIG_DIR, or
 * formspree/ under $XDG_CONFIG_HOME (default ~/.config).
 */
export const configDir = (): string => {
  if (process.env.FORMSPREE_CONFIG_DIR) return process.env.FORMSPREE_CONFIG_DIR;
  const base =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'formspree');
};

/** The credentials file: one entry per endpoint. */
const credentialsFile = (): string =>
  path.join(configDir(), 'credentials.json');

/** Creates a private directory and any missing parents. */
const mkdirp = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
};

/** Reads every stored entry, keyed by endpoint. */
const readAll = (): Entries => {
  try {
    return JSON.parse(fs.readFileSync(credentialsFile(), 'utf8')) as Entries;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return {};
    throw error;
  }
};

/**
 * Replaces the credentials file in one step: writes a private temp file,
 * flushes it, then renames it over the old one. A crash mid-write never
 * leaves a half-written file behind.
 */
const writeAll = (entries: Entries): void => {
  const file = credentialsFile();
  const temporary = `${file}.${process.pid}.tmp`;

  mkdirp(path.dirname(file));

  const fd = fs.openSync(temporary, 'w', 0o600);
  try {
    // A leftover temp file from a crashed process keeps its old mode.
    fs.fchmodSync(fd, 0o600);
    fs.writeSync(fd, JSON.stringify(entries, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(temporary, file);
};

/** Returns the stored entry for an endpoint, or null. */
export const read = (endpoint: string): Credentials | null =>
  readAll()[endpoint] ?? null;

// How long to wait for another live process to finish with the lock.
const LOCK_WAIT_MS = 60 * 1000;
// A lock this old is abandoned even if its pid looks alive (the pid was
// reused). No refresh takes anywhere near this long.
const LOCK_MAX_AGE_MS = 10 * 60 * 1000;
// A lock with no readable owner may be mid-write; give it this long.
const LOCK_UNREADABLE_MS = 10 * 1000;
const LOCK_RETRY_MS = 100;

/** Whether a process with this pid is running on this machine. */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === 'EPERM';
  }
};

/** Reads a lock's owner token (`<pid>:<random>`), or null if it's gone. */
const lockOwner = (lock: string): string | null => {
  try {
    return fs.readFileSync(lock, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
};

/**
 * Whether the lock held by `owner` is abandoned. A lock is never taken
 * from a live process while a refresh could still be in flight, because
 * a second refresh with the same token would revoke the grant.
 */
const abandoned = (lock: string, owner: string): boolean => {
  let age: number;
  try {
    age = Date.now() - fs.statSync(lock).mtimeMs;
  } catch {
    return false;
  }

  const pid = Number.parseInt(owner, 10);
  if (!pid) return age > LOCK_UNREADABLE_MS;
  return !alive(pid) || age > LOCK_MAX_AGE_MS;
};

/**
 * Removes an abandoned lock, but only if it still belongs to `owner`.
 * The lock is renamed aside first (only one process can win a rename),
 * and put back if someone else took it in the meantime.
 */
const breakLock = (lock: string, owner: string, token: string): void => {
  const aside = `${lock}.${token}`;

  try {
    fs.renameSync(lock, aside);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }

  if (lockOwner(aside) !== owner) {
    try {
      fs.linkSync(aside, lock);
    } catch {
      // Another process has taken the lock since; nothing to restore.
    }
  }
  fs.unlinkSync(aside);
};

/**
 * Runs `fn` while holding an exclusive lock on the credentials file, so
 * only one CLI process at a time reads, refreshes and writes it.
 */
const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  const lock = `${credentialsFile()}.lock`;
  const token = `${process.pid}:${randomBytes(8).toString('hex')}`;
  const deadline = Date.now() + LOCK_WAIT_MS;

  mkdirp(path.dirname(lock));

  for (;;) {
    try {
      fs.writeFileSync(lock, token, { flag: 'wx', mode: 0o600 });
      break;
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
    }

    const owner = lockOwner(lock);
    if (owner === null) continue;

    if (abandoned(lock, owner)) {
      breakLock(lock, owner, token);
    } else if (Date.now() > deadline) {
      throw new Error(
        `Another formspree process is holding ${lock}. If none is running, delete that file.`,
      );
    } else {
      await sleep(LOCK_RETRY_MS);
    }
  }

  try {
    return await fn();
  } finally {
    if (lockOwner(lock) === token) fs.unlinkSync(lock);
  }
};

/**
 * Replaces the entry for an endpoint under the lock. `fn` gets the entry
 * as it is on disk now, and returns the entry to store: the same one to
 * leave it alone, or null to remove it. Resolves with what was stored.
 */
export const update = (
  endpoint: string,
  fn: (
    current: Credentials | null,
  ) => Credentials | null | Promise<Credentials | null>,
): Promise<Credentials | null> =>
  withLock(async () => {
    const entries = readAll();
    const current = entries[endpoint] ?? null;
    const next = await fn(current);

    if (next === current) return current;

    if (next) {
      entries[endpoint] = next;
    } else {
      delete entries[endpoint];
    }
    writeAll(entries);
    return next;
  });
