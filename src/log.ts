import chalk from 'chalk';
import { version } from './version.ts';

const withCaret = (text: string): string => `${chalk.gray('>')} ${text}`;
const withCheck = (text: string): string => `${chalk.green('✔')} ${text}`;
const withX = (text: string): string => `${chalk.red.bold('✕')} ${text}`;

/** Where a line goes: `console.log` for stdout, `console.error` for stderr. */
export type Print = (line: string) => void;

/** Logs a green success message, to stdout unless told otherwise. */
export const success = (message: string, print: Print = console.log): void => {
  print(withCheck(chalk.green(message)));
};

/** Logs a progress message, to stdout unless told otherwise. */
export const progress = (message: string, print: Print = console.log): void => {
  print(withCaret(chalk.whiteBright(message)));
};

/** Logs a subtle gray message, to stdout unless told otherwise. */
export const meta = (message: string, print: Print = console.log): void => {
  print(withCaret(chalk.gray(message)));
};

/** Logs a red error message to stderr. */
export const error = (message: string): void => {
  console.error(withX(chalk.red.bold(message)));
};

/** Logs the CLI preamble message. */
export const preamble = (): void => {
  meta(`Formspree CLI v${version}`);
};

/** The Formspree red: the terminal's own red, in bold. */
const brand = chalk.bold.red;

/**
 * Colors the id of something just created in the Formspree red, as the
 * banner is.
 */
export const id = (value: string): string => brand(value);

/**
 * The Formspree banner, from the f.ans design: a red block "F" with the
 * wordmark beside its middle bar.
 */
export const banner = (): string => {
  const bar = ` ${brand('█'.repeat(10))}`;
  const edge = ` ${brand('▀'.repeat(10))}`;
  const arm = `${bar}\n${edge}`;
  const terminal = ` ${brand('█'.repeat(5))}\n ${brand('▀'.repeat(5))}`;
  const wordmark = `${chalk.bold.white('Formspree')}${chalk.white('.io')}`;

  // The wordmark sits beside the middle arm's bar, not its edge.
  return [arm, `${bar}     ${wordmark}`, edge, terminal].join('\n');
};

/** Colorizes a variable for display. */
export const variable = (value: string): string => chalk.cyan.bold(value);
