import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { version as installed } from '../src/version.ts';
import { newer, versionCheck, type UpdateCache } from '../src/version_check.ts';
import { refresh } from '../src/version_refresh.ts';
import { output, useTempConfigDir } from './helpers/oauth.ts';

vi.mock('node:child_process');

const HOUR = 60 * 60 * 1000;
const spawned = vi.mocked(spawn);
const fetched = vi.fn<typeof fetch>();

let cacheFile: string;
let before: NodeJS.ExitListener[];

const setTTY = (value: boolean): void => {
  Object.defineProperty(process.stderr, 'isTTY', {
    value,
    configurable: true,
  });
};

const saved = (): UpdateCache =>
  JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as UpdateCache;
const save = (cache: UpdateCache): void => {
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
};

// The 'exit' listeners the check has put on the process.
const exitListeners = (): NodeJS.ExitListener[] =>
  process.listeners('exit').filter((listener) => !before.includes(listener));

beforeEach(() => {
  cacheFile = path.join(path.dirname(useTempConfigDir()), 'update-check.json');
  before = process.listeners('exit');
  spawned.mockReset();
  spawned.mockReturnValue({ unref: vi.fn() } as unknown as ChildProcess);
  fetched.mockReset();
  vi.stubGlobal('fetch', fetched);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  setTTY(true);
});

afterEach(() => {
  for (const listener of exitListeners()) {
    process.removeListener('exit', listener);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(process.stderr, 'isTTY');
});

describe('the check', () => {
  it('asks the registry in a detached process, without waiting for it', () => {
    versionCheck();

    expect(spawned).toHaveBeenCalledTimes(1);
    expect(spawned).toHaveBeenCalledWith(
      process.execPath,
      [path.join(import.meta.dirname, '..', 'src', 'version_refresh.ts')],
      { detached: true, stdio: 'ignore' },
    );
    expect(spawned.mock.results[0]?.value.unref).toHaveBeenCalled();
    expect(fetched).not.toHaveBeenCalled();
  });

  it('marks the check as made, so the next command does not ask too', () => {
    versionCheck();
    versionCheck();

    expect(spawned).toHaveBeenCalledTimes(1);
    expect(saved().checkedAt).toBeGreaterThan(Date.now() - 1000);
  });

  it('asks again once the last check is over a day old', () => {
    save({ checkedAt: Date.now() - 25 * HOUR, latest: installed });

    versionCheck();

    expect(spawned).toHaveBeenCalledTimes(1);
    expect(saved().latest).toBe(installed);
  });

  it('says a later version is out once the command is done', () => {
    save({ checkedAt: Date.now() - HOUR, latest: '99.0.0' });

    versionCheck();

    expect(spawned).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();

    const [whenDone] = exitListeners();
    whenDone?.(0);

    expect(output(console.error)).toContain('Update Available!');
    expect(output(console.error)).toContain(`v${installed} ➜ v99.0.0`);
  });

  it.each([installed, '0.0.1'])(
    'says nothing when the latest version is %s',
    (latest) => {
      save({ checkedAt: Date.now() - HOUR, latest });

      versionCheck();

      expect(exitListeners()).toEqual([]);
    },
  );

  it('does nothing off a terminal', () => {
    setTTY(false);
    save({ checkedAt: 0, latest: '99.0.0' });

    versionCheck();

    expect(spawned).not.toHaveBeenCalled();
    expect(exitListeners()).toEqual([]);
    expect(saved().checkedAt).toBe(0);
  });

  it('treats a file it cannot read as no check yet', () => {
    fs.writeFileSync(cacheFile, '{"latest": ');

    versionCheck();

    expect(exitListeners()).toEqual([]);
    expect(spawned).toHaveBeenCalledTimes(1);
  });

  it('never fails the command when the check cannot start', () => {
    spawned.mockImplementation(() => {
      throw new Error('spawn EAGAIN');
    });

    expect(() => versionCheck()).not.toThrow();
  });
});

describe('newer', () => {
  it.each([
    ['1.0.0', '0.9.6', true],
    ['0.10.0', '0.9.6', true],
    ['0.9.7', '0.9.6', true],
    ['0.9.6', '0.9.6', false],
    ['0.9.5', '0.9.6', false],
    ['0.9', '0.9.6', false],
    ['1.0.0-beta.1', '0.9.6', true],
    ['not a version', '0.9.6', false],
  ])('%s later than %s: %s', (a, b, expected) => {
    expect(newer(a, b)).toBe(expected);
  });
});

describe('the detached refresh', () => {
  it('saves the latest version on the registry', async () => {
    save({ checkedAt: 1, latest: '0.0.1' });
    fetched.mockResolvedValue(Response.json({ version: '99.0.0' }));

    await refresh();

    expect(fetched).toHaveBeenCalledWith(
      'https://registry.npmjs.org/@formspree/cli/latest',
      expect.anything(),
    );
    expect(saved().latest).toBe('99.0.0');
    expect(saved().checkedAt).toBeGreaterThan(Date.now() - 1000);
  });

  it.each([
    ['cannot be reached', () => Promise.reject(new Error('ENOTFOUND'))],
    [
      'answers with an error',
      () => Promise.resolve(new Response('Not found', { status: 404 })),
    ],
    [
      'answers with no version',
      () => Promise.resolve(Response.json({ name: '@formspree/cli' })),
    ],
  ])(
    'leaves the last answer in place when the registry %s',
    async (_case, reply) => {
      save({ checkedAt: 1, latest: '0.0.1' });
      fetched.mockImplementation(reply);

      await refresh();

      expect(saved()).toEqual({ checkedAt: 1, latest: '0.0.1' });
    },
  );
});
