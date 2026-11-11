import chalk from 'chalk';
import { version } from './version.ts';

const withCaret = (text: string): string => `${chalk.gray('>')} ${text}`;
const withCheck = (text: string): string => `${chalk.green('✔')} ${text}`;
const withX = (text: string): string => `${chalk.red.bold('✕')} ${text}`;

/** Logs a green success message to stdout. */
export const success = (message: string): void => {
  console.log(withCheck(chalk.green(message)));
};

/** Logs a progress message to stdout. */
export const progress = (message: string): void => {
  console.log(withCaret(chalk.whiteBright(message)));
};

/** Logs a subtle gray message to stdout. */
export const meta = (message: string): void => {
  console.log(withCaret(chalk.gray(message)));
};

/** Logs a red error message to stderr. */
export const error = (message: string): void => {
  console.error(withX(chalk.red.bold(message)));
};

/** Logs the CLI preamble message. */
export const preamble = (): void => {
  meta(`Formspree CLI v${version}`);
};

/**
 * The Formspree banner, from the f.ans design: a red block "F" with the
 * wordmark beside its middle bar.
 */
export const banner = (): string => {
  const bar = ` ${chalk.bold.red('█'.repeat(10))}`;
  const edge = ` ${chalk.bold.red('▀'.repeat(10))}`;
  const arm = `${bar}\n${edge}`;
  const terminal = ` ${chalk.bold.red('█'.repeat(5))}\n ${chalk.bold.red('▀'.repeat(5))}`;
  const wordmark = `${chalk.bold.white('Formspree')}${chalk.white('.io')}`;

  // The wordmark sits beside the middle arm's bar, not its edge.
  return [arm, `${bar}     ${wordmark}`, edge, terminal].join('\n');
};

/** Colorizes a variable for display. */
export const variable = (value: string): string => chalk.cyan.bold(value);
