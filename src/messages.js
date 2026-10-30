const chalk = require('chalk');
const log = require('./log');
const { normalizeEndpoint } = require('./oauth');
const { stripIndent } = require('common-tags');

const authRequired = () => {
  log.error('Deploy key is required');
  console.error('');

  // prettier-ignore
  console.error(stripIndent`
    Your deploy key can be found under "Settings" in the UI.
    There are couple ways to use your key:

    - Use the ${log.variable('-k')} flag, or
    - Set the ${log.variable('FORMSPREE_DEPLOY_KEY')} env variable

    ${chalk.yellow.bold('-- Examples -----------------------------------------------')}

    The inline method looks like this:

      ${chalk.gray('$')} formspree deploy ${chalk.cyan('-k')} ${chalk.yellow('<your-deploy-key>')}

    For convenience, you can add it to a ${log.variable('.env')} file.
    That way, you don't have to copy/paste it every time
    you run a command:

      ${chalk.gray('$')} echo "FORMSPREE_DEPLOY_KEY=${chalk.yellow('<your-deploy-key>')}" >> .env
      ${chalk.gray('$')} formspree deploy

    Just be sure to add ${log.variable('.env')} to your ${log.variable('.gitignore')} file,
    so your deploy key does not end up in version control.
  `);

  console.error('');
};

/**
 * The command that logs in to `endpoint` again: plain `formspree login`
 * when that already reaches it (the default, or $FORMSPREE_API_URL), else
 * with FORMSPREE_API_URL set for that one run.
 *
 * @param {string} endpoint
 * @param {string} [vars] other env assignments to show before the command
 */
const loginCommand = (endpoint, vars = '') => {
  const url =
    endpoint === normalizeEndpoint()
      ? ''
      : `FORMSPREE_API_URL=${chalk.yellow(endpoint)} `;
  return `${chalk.gray('$')} ${url}${vars}formspree login`;
};

const clientIdRequired = endpoint => {
  log.error(`No OAuth client id for ${endpoint}`);
  console.error('');

  // prettier-ignore
  console.error(stripIndent`
    Logging in needs the id of the "Formspree CLI" OAuth client
    on that endpoint. There are couple ways to provide it:

    - Use the ${log.variable('--client-id')} flag, or
    - Set the ${log.variable('FORMSPREE_CLIENT_ID')} env variable

    ${chalk.yellow.bold('-- Example ------------------------------------------------')}

      ${loginCommand(endpoint, `FORMSPREE_CLIENT_ID=${chalk.yellow('<client-id>')} `)}
  `);

  console.error('');
};

const loginRequired = (endpoint, reason) => {
  log.error(reason);
  console.error('');
  console.error(`  Run ${loginCommand(endpoint)}`);
  console.error('');
};

module.exports = { authRequired, clientIdRequired, loginRequired };
