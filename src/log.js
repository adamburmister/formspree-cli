const chalk = require('chalk');
const version = require('../package.json').version;

const withCaret = str => {
  return `${chalk.gray('>')} ${str}`;
};

const withCheck = str => {
  return `${chalk.green('✔')} ${str}`;
};

const withX = str => {
  return `${chalk.red.bold('✕')} ${str}`;
};

/**
 * Logs a green success message to stdout.
 *
 * @param {string} msg
 */
const success = msg => {
  console.log(withCheck(chalk.green(msg)));
};

/**
 * Logs a progress message to stdout.
 *
 * @param {string} msg
 */
const progress = msg => {
  console.log(withCaret(chalk.whiteBright(msg)));
};

/**
 * Logs a subtle gray message to stdout.
 *
 * @param {string} msg
 */
const meta = msg => {
  console.log(withCaret(chalk.gray(msg)));
};

/**
 * Logs a red error message to stderr.
 *
 * @param {string} msg
 */
const error = msg => {
  console.error(withX(chalk.red.bold(msg)));
};

/**
 * Logs the CLI preamble message.
 */
const preamble = () => {
  meta(`Formspree CLI v${version}`);
};

/**
 * The Formspree banner, from the f.ans design: a red block "F" with the
 * wordmark beside its middle bar.
 */
const banner = () => {
  const arm =
    ' ' +
    chalk.bold.red('█'.repeat(10)) +
    '\n ' +
    chalk.bold.red('▀'.repeat(10));
  const terminal =
    ' ' + chalk.bold.red('█'.repeat(5)) + '\n ' + chalk.bold.red('▀'.repeat(5));
  const wordmark = `${chalk.bold.white('Formspree')}${chalk.white('.io')}`;

  return [arm, `${arm}     ${wordmark}`, terminal].join('\n');
};

/**
 * Colorizes a variable for display.
 *
 * @param {string} val
 */
const variable = val => {
  return chalk.cyan.bold(`${val}`);
};

module.exports = {
  success,
  progress,
  meta,
  error,
  preamble,
  banner,
  variable
};
