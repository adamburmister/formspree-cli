import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { configDir } from './credentials.ts';
import * as log from './log.ts';
import { version as installedVersion } from './version.ts';

/** How long the latest version found on the registry is trusted. */
export const CHECK_EVERY = 24 * 60 * 60 * 1000;

/** What the last check found. */
export interface UpdateCache {
  checkedAt?: number;
  latest?: string;
}

const cacheFile = (): string => path.join(configDir(), 'update-check.json');

/** Empty when there has been no check, or the file can't be read. */
export const readCache = (): UpdateCache => {
  try {
    const cache: unknown = JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));
    return cache !== null && typeof cache === 'object' ? cache : {};
  } catch {
    return {};
  }
};

export const writeCache = (cache: UpdateCache): void => {
  const file = cacheFile();
  const temporary = `${file}.${process.pid}.tmp`;

  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(temporary, JSON.stringify(cache));
  fs.renameSync(temporary, file);
};

/**
 * Whether version `a` is later than `b`, comparing their numbers. A
 * pre-release tag is ignored.
 */
export const newer = (a: string, b: string): boolean => {
  const numbers = (version: string): number[] =>
    (version.split('-')[0] ?? '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
  const [left, right] = [numbers(a), numbers(b)];

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
};

const notice = (latest: string): void => {
  console.error('');
  console.error(
    `${chalk.gray('>')} ${chalk.yellow.bold('Update Available!')} ${chalk.gray(
      `v${installedVersion} ➜ v${latest}`,
    )}`,
  );
  console.error(
    `  Run ${log.variable('npm i --save-dev @formspree/cli@latest')} to update.`,
  );
  console.error('');
};

// The script that asks the registry: beside this file, with its extension
// (.ts when run from source, .js once built).
const refreshScript = path.join(
  import.meta.dirname,
  `version_refresh${path.extname(import.meta.filename)}`,
);

/**
 * Says when a later version is out, without holding the command up.
 *
 * It only reads what the last check found: if that's a later version, the
 * notice is printed once the command is done. When the last check is over
 * a day old, a detached process asks the registry and saves the answer for
 * next time; this command doesn't wait for it.
 *
 * Off a terminal there's nobody to tell, so nothing is read or checked.
 */
export const versionCheck = (): void => {
  if (!process.stderr.isTTY) return;

  const cache = readCache();
  const { latest } = cache;

  if (typeof latest === 'string' && newer(latest, installedVersion)) {
    process.once('exit', () => notice(latest));
  }

  if (Date.now() - (Number(cache.checkedAt) || 0) < CHECK_EVERY) return;

  // A check must never break the command it rides along with.
  try {
    // Marked as checked first, so commands run meanwhile don't ask too.
    writeCache({ ...cache, checkedAt: Date.now() });
    spawn(process.execPath, [refreshScript], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch {
    // Nothing to do: the next command tries again.
  }
};
