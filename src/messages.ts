import chalk from 'chalk';
import { stripIndent } from 'common-tags';
import * as log from './log.ts';
import { DEFAULT_ENDPOINT } from './oauth.ts';

export const authRequired = (): void => {
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
 * Says which server is in use when it isn't formspree.io, so a stray
 * FORMSPREE_API_URL (say, from a project's .env) can't redirect a login
 * unnoticed. With `stderr` it stays out of stdout, which --json keeps for
 * the response.
 */
export const usingEndpoint = (
  endpoint: string,
  { stderr = false }: { stderr?: boolean | undefined } = {},
): void => {
  if (endpoint === DEFAULT_ENDPOINT) return;
  if (stderr) {
    console.error(chalk.gray(`Using ${endpoint} (FORMSPREE_API_URL)`));
    return;
  }
  log.meta(`Using ${log.variable(endpoint)} (FORMSPREE_API_URL)`);
};

export const loginRequired = (reason: string): void => {
  log.error(reason);
  console.error('');
  console.error(`  Run ${chalk.gray('$')} formspree login`);
  console.error('');
};
