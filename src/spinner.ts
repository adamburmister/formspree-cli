import * as clack from '@clack/prompts';
import type { SpinnerResult } from '@clack/prompts';

/** A running spinner: what a command needs to end it. */
export interface Spinner {
  start(message: string): void;
  message(message: string): void;
  /** Ends it, leaving `message` in its place. */
  stop(message?: string): void;
  /** Ends it as a failure, leaving `message` in its place. */
  error(message?: string): void;
  /** Ends it without a trace. */
  clear(): void;
}

/**
 * Wraps a clack spinner so that Ctrl+C while it runs ends the process with
 * exit code 130, as an interrupt does everywhere else. Left alone, clack
 * exits with 0, as if the work had succeeded.
 */
export const guarded = (spinner: SpinnerResult): Spinner => {
  const interrupted = (): void => {
    process.exitCode = 130;
  };
  const release = (): void => {
    process.removeListener('exit', interrupted);
  };

  return {
    start: (message) => {
      process.on('exit', interrupted);
      spinner.start(message);
    },
    message: (message) => spinner.message(message),
    stop: (message) => {
      release();
      spinner.stop(message);
    },
    error: (message) => {
      release();
      spinner.error(message);
    },
    clear: () => {
      release();
      spinner.clear();
    },
  };
};

/**
 * Starts a spinner on stderr for work that has no prompts around it.
 * `clear()` removes it without a trace: what happened is for the command
 * to say.
 *
 * Off a terminal there's nothing to animate, so the message is written
 * once, as a line.
 *
 * @param message What's being waited for, with no trailing dots
 */
export const start = (message: string): Pick<Spinner, 'clear'> => {
  if (!process.stderr.isTTY) {
    process.stderr.write(`- ${message}...\n`);
    return { clear: () => {} };
  }

  const spinner = guarded(
    clack.spinner({ output: process.stderr, withGuide: false }),
  );
  spinner.start(message);
  return spinner;
};
