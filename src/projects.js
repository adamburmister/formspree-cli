const chalk = require('chalk');
const v1 = require('./v1');

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

module.exports = { line, show };
