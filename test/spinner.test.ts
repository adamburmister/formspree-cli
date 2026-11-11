import * as clack from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as spin from '../src/spinner.ts';

vi.mock('@clack/prompts', () => ({ spinner: vi.fn() }));

const clackSpinner = () => ({
  start: vi.fn(),
  message: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  error: vi.fn(),
  clear: vi.fn(),
  isCancelled: false,
});

const setTTY = (value: boolean): void => {
  Object.defineProperty(process.stderr, 'isTTY', {
    value,
    configurable: true,
  });
};

let before: NodeJS.ExitListener[];

// The 'exit' listeners the spinner has on the process right now.
const exitListeners = (): NodeJS.ExitListener[] =>
  process.listeners('exit').filter((listener) => !before.includes(listener));

beforeEach(() => {
  before = process.listeners('exit');
  vi.mocked(clack.spinner).mockReset();
  process.exitCode = undefined;
});

afterEach(() => {
  for (const listener of exitListeners()) {
    process.removeListener('exit', listener);
  }
  vi.restoreAllMocks();
  Reflect.deleteProperty(process.stderr, 'isTTY');
  process.exitCode = undefined;
});

describe('start', () => {
  it('writes the message once, as a line, off a terminal', () => {
    setTTY(false);
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    const spinner = spin.start('Deploying');
    spinner.clear();

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('- Deploying...\n');
    expect(clack.spinner).not.toHaveBeenCalled();
  });

  it("starts clack's spinner on stderr, without the guide, on a terminal", () => {
    setTTY(true);
    const inner = clackSpinner();
    vi.mocked(clack.spinner).mockReturnValue(inner);

    const started = spin.start('Deploying');

    expect(clack.spinner).toHaveBeenCalledWith({
      output: process.stderr,
      withGuide: false,
    });
    expect(inner.start).toHaveBeenCalledWith('Deploying');

    started.clear();

    expect(inner.clear).toHaveBeenCalled();
  });
});

describe('guarded', () => {
  it('makes an exit while the spinner runs an interrupt', () => {
    const spinner = spin.guarded(clackSpinner());

    spinner.start('Working');
    const [interrupted] = exitListeners();
    interrupted?.(0);

    expect(process.exitCode).toBe(130);
  });

  it.each(['stop', 'error', 'clear'] as const)(
    'leaves the exit code alone once the spinner ends with %s',
    (method) => {
      const inner = clackSpinner();
      const spinner = spin.guarded(inner);

      spinner.start('Working');
      spinner[method]('Done');

      expect(inner[method]).toHaveBeenCalled();
      expect(exitListeners()).toEqual([]);
    },
  );

  it("passes a new message through to clack's spinner", () => {
    const inner = clackSpinner();
    const spinner = spin.guarded(inner);

    spinner.start('Working');
    spinner.message('Still working');

    expect(inner.message).toHaveBeenCalledWith('Still working');
  });
});
