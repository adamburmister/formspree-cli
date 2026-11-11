import * as clack from '@clack/prompts';
import type {
  ConfirmOptions,
  MultiSelectOptions,
  SelectOptions,
  TextOptions,
} from '@clack/prompts';
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
 * @clack/prompts as its docs use it, with two things taken care of:
 *
 * - Everything is drawn on stderr, so stdout stays the command's output.
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
  spinner(): Spinner;
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
  intro: (title) => clack.intro(title, drawn),
  outro: (message) => clack.outro(message, drawn),
  text: async (options) =>
    answered<string>(await clack.text({ ...options, ...drawn })),
  confirm: async (options) =>
    answered<boolean>(await clack.confirm({ ...options, ...drawn })),
  select: async <Value>(options: SelectOptions<Value>) =>
    answered<Value>(await clack.select({ ...options, ...drawn })),
  multiselect: async <Value>(options: MultiSelectOptions<Value>) =>
    answered<Value[]>(await clack.multiselect({ ...options, ...drawn })),
  spinner: () => guarded(clack.spinner(drawn)),
};

/** Runs `run` with the prompts to ask its questions. */
export const session = <T>(run: (p: Prompts) => Promise<T>): Promise<T> =>
  run(prompts);
