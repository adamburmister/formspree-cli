/**
 * Stands in for @clack/prompts, so tests can script the answers:
 *
 *   vi.mock('@clack/prompts', () => import('../helpers/clack.ts'));
 */
import { vi } from 'vitest';

/** In place of an answer: the question is abandoned with Ctrl+C. */
export const CTRL_C = Symbol('Ctrl+C');

type Kind = 'text' | 'confirm' | 'select' | 'multiselect';

interface Choice {
  value: unknown;
  label: string;
}

/** The parts of a prompt's options the stand-in reads. */
interface Options {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  initialValue?: unknown;
  options?: Choice[];
  validate?: (value: string) => string | Error | undefined;
}

/** A question, as a test sees it. */
export interface Asked {
  kind: Kind;
  message: string;
  placeholder?: string;
  options?: string[];
}

/**
 * A scripted answer: text for a text question, an option's label for a
 * select, a list of labels for a multiselect, true or false for a confirm,
 * '' for Enter alone, or CTRL_C to abandon it.
 */
export type Answer = string | string[] | boolean | typeof CTRL_C;

let queue: Answer[] = [];
let asked: Asked[] = [];

const valueOf = (options: Options, label: unknown): unknown => {
  const choice = options.options?.find((item) => item.label === label);
  if (!choice) throw new Error(`No option is labelled "${String(label)}"`);
  return choice.value;
};

/** What a question resolves with when Enter is all it gets. */
const untouched = (kind: Kind, options: Options): unknown => {
  switch (kind) {
    case 'text':
      return options.defaultValue ?? '';
    case 'confirm':
      return options.initialValue;
    case 'select':
      return options.initialValue ?? options.options?.[0]?.value;
    case 'multiselect':
      return [];
  }
};

/** What clack would resolve with for a scripted answer. */
const resolved = (kind: Kind, options: Options, answer: Answer): unknown => {
  if (answer === '') return untouched(kind, options);
  if (kind === 'select') return valueOf(options, answer);
  if (kind === 'multiselect' && Array.isArray(answer)) {
    return answer.map((label) => valueOf(options, label));
  }
  return answer;
};

const question =
  (kind: Kind) =>
  (options: Options): Promise<unknown> => {
    asked.push({
      kind,
      message: options.message,
      ...(options.placeholder ? { placeholder: options.placeholder } : {}),
      ...(options.options
        ? { options: options.options.map((choice) => choice.label) }
        : {}),
    });

    for (;;) {
      const answer = queue.shift();
      if (answer === undefined) {
        return Promise.resolve(untouched(kind, options));
      }
      if (answer === CTRL_C) return Promise.resolve(CTRL_C);

      const value = resolved(kind, options, answer);
      // A text answer its validation refuses is asked for again.
      if (kind === 'text' && options.validate?.(String(value))) continue;
      return Promise.resolve(value);
    }
  };

// What @clack/prompts exports, as far as the CLI uses it.
export const isCancel = (value: unknown): boolean => value === CTRL_C;
export const intro = vi.fn();
export const outro = vi.fn();
export const cancel = vi.fn();
export const text = question('text');
export const confirm = question('confirm');
export const select = question('select');
export const multiselect = question('multiselect');

const theSpinner = {
  start: vi.fn(),
  message: vi.fn(),
  stop: vi.fn(),
  error: vi.fn(),
  clear: vi.fn(),
};
export const spinner = () => theSpinner;

/**
 * Scripts the answers to the questions, in order. Once they run out, every
 * question gets Enter. Returns the questions asked, and the spies for the
 * rest of what a session draws: intro, outro, cancel and the spinner.
 */
export const answerPrompts = (answers: Answer[] = []) => {
  queue = [...answers];
  asked = [];
  for (const spy of [intro, outro, cancel, ...Object.values(theSpinner)]) {
    spy.mockClear();
  }
  return { asked, intro, outro, cancel, spinner: theSpinner };
};

/** Makes stdin look like a terminal, or not. */
export const setTTY = (value: boolean): void => {
  Object.defineProperty(process.stdin, 'isTTY', {
    value,
    configurable: true,
  });
};

export const unsetTTY = (): void => {
  Reflect.deleteProperty(process.stdin, 'isTTY');
};
