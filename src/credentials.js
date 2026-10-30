const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const env = require('process').env;

/**
 * The directory holding the credentials file: $FORMSPREE_CONFIG_DIR, or
 * formspree/ under $XDG_CONFIG_HOME (default ~/.config).
 */
const configDir = () => {
  if (env.FORMSPREE_CONFIG_DIR) return env.FORMSPREE_CONFIG_DIR;
  const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'formspree');
};

/**
 * The credentials file: one entry per endpoint.
 */
const credentialsFile = () => path.join(configDir(), 'credentials.json');

/**
 * Creates a private directory and any missing parents.
 *
 * @param {string} dir
 */
const mkdirp = dir => {
  if (fs.existsSync(dir)) return;
  mkdirp(path.dirname(dir));
  fs.mkdirSync(dir, { mode: 0o700 });
};

/**
 * Reads every stored entry, keyed by endpoint.
 */
const readAll = () => {
  try {
    return JSON.parse(fs.readFileSync(credentialsFile(), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
};

/**
 * Replaces the credentials file in one step: writes a private temp file,
 * flushes it, then renames it over the old one. A crash mid-write never
 * leaves a half-written file behind.
 */
const writeAll = entries => {
  const file = credentialsFile();
  const tmp = `${file}.${process.pid}.tmp`;

  mkdirp(path.dirname(file));

  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    // A leftover temp file from a crashed process keeps its old mode.
    fs.fchmodSync(fd, 0o600);
    fs.writeSync(fd, JSON.stringify(entries, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(tmp, file);
};

/**
 * Returns the stored entry for an endpoint, or null.
 *
 * @param {string} endpoint
 */
const read = endpoint => readAll()[endpoint] || null;

// How long to wait for another live process to finish with the lock.
const LOCK_WAIT_MS = 60 * 1000;
// A lock this old is abandoned even if its pid looks alive (the pid was
// reused). No refresh takes anywhere near this long.
const LOCK_MAX_AGE_MS = 10 * 60 * 1000;
// A lock with no readable owner may be mid-write; give it this long.
const LOCK_UNREADABLE_MS = 10 * 1000;
const LOCK_RETRY_MS = 100;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Whether a process with this pid is running on this machine.
 *
 * @param {number} pid
 */
const alive = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
};

/**
 * Reads a lock's owner token (`<pid>:<random>`), or null if it's gone.
 */
const lockOwner = lock => {
  try {
    return fs.readFileSync(lock, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
};

/**
 * Whether the lock held by `owner` is abandoned. A lock is never taken
 * from a live process while a refresh could still be in flight, because
 * a second refresh with the same token would revoke the grant.
 */
const abandoned = (lock, owner) => {
  let age;
  try {
    age = Date.now() - fs.statSync(lock).mtimeMs;
  } catch (err) {
    return false;
  }

  const pid = parseInt(owner, 10);
  if (!pid) return age > LOCK_UNREADABLE_MS;
  return !alive(pid) || age > LOCK_MAX_AGE_MS;
};

/**
 * Removes an abandoned lock, but only if it still belongs to `owner`.
 * The lock is renamed aside first (only one process can win a rename),
 * and put back if someone else took it in the meantime.
 */
const breakLock = (lock, owner, token) => {
  const aside = `${lock}.${token}`;

  try {
    fs.renameSync(lock, aside);
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }

  if (lockOwner(aside) !== owner) {
    try {
      fs.linkSync(aside, lock);
    } catch (err) {
      // Another process has taken the lock since; nothing to restore.
    }
  }
  fs.unlinkSync(aside);
};

/**
 * Runs `fn` while holding an exclusive lock on the credentials file, so
 * only one CLI process at a time reads, refreshes and writes it.
 *
 * @param {function} fn
 */
const withLock = async fn => {
  const lock = `${credentialsFile()}.lock`;
  const token = `${process.pid}:${crypto.randomBytes(8).toString('hex')}`;
  const deadline = Date.now() + LOCK_WAIT_MS;

  mkdirp(path.dirname(lock));

  for (;;) {
    try {
      fs.writeFileSync(lock, token, { flag: 'wx', mode: 0o600 });
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }

    const owner = lockOwner(lock);
    if (owner === null) continue;

    if (abandoned(lock, owner)) {
      breakLock(lock, owner, token);
    } else if (Date.now() > deadline) {
      throw new Error(
        `Another formspree process is holding ${lock}. If none is running, delete that file.`
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
 *
 * @param {string} endpoint
 * @param {function} fn
 */
const update = (endpoint, fn) => {
  return withLock(async () => {
    const entries = readAll();
    const current = entries[endpoint] || null;
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
};

module.exports = { read, update };
