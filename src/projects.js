const chalk = require('chalk');
const v1 = require('./v1');
const prompt = require('./prompt');
const accounts = require('./accounts');

/**
 * A project on one line, as the lists show it.
 */
const line = project => {
  return `${project.name || 'Untitled project'} ${chalk.gray(
    `(${project.id})`
  )}`;
};

/**
 * Prints one project's details.
 */
const show = project => {
  const links = project.links || {};

  v1.rows([
    ['Account', project.account_id],
    ['Kind', project.kind],
    ['Timezone', project.timezone],
    ['Allowed domains', project.domain_whitelist],
    ['Dashboard', links.dashboard && chalk.cyan(links.dashboard)]
  ]);
};

/**
 * Asks for what `projects create` wasn't given: the name, which can be
 * skipped, and the account when there are several to choose from.
 * Resolves with the answers under the options' names. Asks nothing when
 * nothing is missing.
 *
 * @param {{ name?: string, accounts: object[] }} known
 */
const ask = async ({ name, accounts: choices }) => {
  if (name !== undefined && choices.length < 2) return {};

  return prompt.session(async form => {
    const answers = {};

    form.say('');
    form.say(
      `  ${chalk.bold('New project.')} ${chalk.gray(
        'Press Enter to skip a question.'
      )}`
    );
    form.say('');

    if (name === undefined) {
      answers.name = await form.text('Name', {
        hint: 'default "New Project"'
      });
    }
    if (choices.length > 1) {
      answers.account = await accounts.pick(form, choices);
    }

    form.say('');
    return answers;
  });
};

module.exports = { line, show, ask };
