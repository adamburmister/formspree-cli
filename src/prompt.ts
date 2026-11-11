import * as clack from '@clack/prompts';
import chalk from 'chalk';
import type {
  ConfirmOptions,
  MultiSelectOptions,
  SelectOptions,
  TextOptions,
} from '@clack/prompts';
import * as log from './log.ts';
import { guarded, type Spinner } from './spinner.ts';

/**
 * Thrown when a question is abandoned with Ctrl+C. By then the prompt has
 * said so on the terminal.
 */
export class Cancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'Cancelled';
  }
}

/**
 * @clack/prompts as its docs use it, with three things taken care of:
 *
 * - Everything is drawn on stderr, so stdout stays the command's output.
 * - `intro` opens a set of questions under the Formspree banner.
 * - A prompt that's cancelled says so with `cancel` and rejects with
 *   Cancelled, in place of an `isCancel` check after each one.
 */
export interface Prompts {
  intro(title: string): void;
  outro(message?: string): void;
  text(options: TextOptions): Promise<string>;
  confirm(options: ConfirmOptions): Promise<boolean>;
  select<Value>(options: SelectOptions<Value>): Promise<Value>;
  multiselect<Value>(options: MultiSelectOptions<Value>): Promise<Value[]>;
  /**
   * A spinner among the questions. Without `guide` it has no line of the
   * questions' own above it: for one that's cleared to make way for a
   * note, which brings that line itself.
   */
  spinner(options?: { guide?: boolean }): Spinner;
}

/** Whether someone is at a terminal to answer questions. */
export const interactive = (): boolean => Boolean(process.stdin.isTTY);

const drawn = { output: process.stderr };

const answered = <T>(value: T | symbol): T => {
  if (clack.isCancel(value)) {
    clack.cancel('Cancelled. Nothing was changed.', drawn);
    throw new Cancelled();
  }
  // With the cancel symbol ruled out, what's left is the answer.
  return value as T;
};

const prompts: Prompts = {
  intro: (title) => {
    console.error(`\n${log.banner()}\n`);
    clack.intro(title, drawn);
  },
  outro: (message) => clack.outro(message, drawn),
  text: async (options) =>
    answered<string>(await clack.text({ ...options, ...drawn })),
  confirm: async (options) =>
    answered<boolean>(await clack.confirm({ ...options, ...drawn })),
  select: async <Value>(options: SelectOptions<Value>) =>
    answered<Value>(await clack.select({ ...options, ...drawn })),
  multiselect: async <Value>(options: MultiSelectOptions<Value>) =>
    answered<Value[]>(await clack.multiselect({ ...options, ...drawn })),
  spinner: ({ guide = true } = {}) =>
    guarded(clack.spinner({ ...drawn, withGuide: guide })),
};

/** Runs `run` with the prompts to ask its questions. */
export const session = <T>(run: (p: Prompts) => Promise<T>): Promise<T> =>
  run(prompts);

/**
 * Frames a block of a command's output in a titled box, as wide as what's
 * in it. Unlike the prompts it goes to stdout, with the rest of the
 * output, unless it belongs to an error: then `stderr` sends it there.
 */
export const box = (
  message: string,
  title: string,
  { stderr = false }: { stderr?: boolean } = {},
): void => {
  // clack's defaults are the terminal's full width and square corners.
  clack.box(message, ` ${title} `, {
    output: stderr ? process.stderr : process.stdout,
    withGuide: false,
    width: 'auto',
    rounded: true,
    formatBorder: (border) => chalk.gray(border),
  });
};

/**
 * Sets a block of a command's output apart as a titled note, on stdout.
 * With `guide` it's drawn as part of the questions above it, joined to
 * their line down the left; a session's `outro` then closes it.
 */
export const note = (
  message: string,
  title: string,
  { guide = false }: { guide?: boolean } = {},
): void => {
  clack.note(message, title, {
    output: process.stdout,
    withGuide: guide,
    // The lines keep their own colors: clack would dim them all.
    format: (line) => line,
  });
};
