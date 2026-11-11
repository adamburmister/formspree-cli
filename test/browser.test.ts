import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { available, open } from '../src/browser.ts';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

/** A child process that starts, or fails to, on the next tick. */
const child = (starts: boolean) => {
  const emitter = Object.assign(new EventEmitter(), { unref: vi.fn() });
  process.nextTick(() =>
    starts ? emitter.emit('spawn') : emitter.emit('error', new Error('ENOENT')),
  );
  return emitter;
};

const spawned = vi.mocked(spawn) as unknown as ReturnType<
  typeof vi.fn<(command: string, args: string[], options: object) => unknown>
>;

const onPlatform = (platform: NodeJS.Platform): void => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
};

beforeEach(() => {
  spawned.mockImplementation(() => child(true));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  spawned.mockReset();
  Reflect.deleteProperty(process.stdout, 'isTTY');
});

describe('open', () => {
  it.each([
    ['darwin', 'open', ['https://formspree.io/forms']],
    ['linux', 'xdg-open', ['https://formspree.io/forms']],
    [
      'win32',
      'rundll32',
      ['url.dll,FileProtocolHandler', 'https://formspree.io/forms'],
    ],
  ] as const)(
    'hands the link to %s with %s',
    async (platform, command, args) => {
      onPlatform(platform);

      const opened = await open('https://formspree.io/forms');

      expect(opened).toBe(true);
      expect(spawned).toHaveBeenCalledWith(command, args, {
        stdio: 'ignore',
        detached: true,
      });
    },
  );

  it('lets the browser outlive the command', async () => {
    const started = child(true);
    spawned.mockImplementation(() => started);

    await open('https://formspree.io/forms');

    expect(started.unref).toHaveBeenCalled();
  });

  it('resolves with false when there is nothing to open it with', async () => {
    spawned.mockImplementation(() => child(false));

    expect(await open('https://formspree.io/forms')).toBe(false);
  });

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'not a url', ''])(
    'opens nothing for %j, which is not a web page',
    async (url) => {
      expect(await open(url)).toBe(false);
      expect(spawned).not.toHaveBeenCalled();
    },
  );
});

describe('available', () => {
  const tty = (value: boolean): void => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value,
      configurable: true,
    });
  };

  beforeEach(() => {
    vi.stubEnv('SSH_CONNECTION', '');
    vi.stubEnv('SSH_TTY', '');
  });

  it('is true in a terminal on this machine', () => {
    tty(true);

    expect(available()).toBe(true);
  });

  it('is false when the output goes somewhere else', () => {
    tty(false);

    expect(available()).toBe(false);
  });

  it('goes by the stream it is given, when the command talks on another', () => {
    tty(false);

    expect(available({ isTTY: true })).toBe(true);
    expect(available({ isTTY: false })).toBe(false);
    expect(available({})).toBe(false);
  });

  it.each(['SSH_CONNECTION', 'SSH_TTY'])('is false over SSH (%s)', (name) => {
    tty(true);
    vi.stubEnv(name, '10.0.0.1 22');

    expect(available()).toBe(false);
  });
});
