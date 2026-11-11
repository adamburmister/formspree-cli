import deployment from '@formspree/deploy';
import type { DeployResponse } from '@formspree/deploy';
import chalk from 'chalk';
import type { Argv } from 'yargs';
import type { Args, Command } from '../command.ts';
import * as log from '../log.ts';
import * as messages from '../messages.ts';
import * as spin from '../spinner.ts';
import { traverse } from '../traverse.ts';
import { userAgent } from '../version.ts';

const printErrors = ({ code, errors = [] }: DeployResponse['data']): void => {
  console.error('');
  errors.forEach((error, index) => {
    const field =
      code === 'CONFIG_VALIDATION_ERROR' ? `${chalk.cyan(error.field)} ` : '';
    console.error(`  ${index + 1}) ${field}${error.message}`);
  });
  console.error('');
};

const printDeployLog = ({ log: lines }: DeployResponse['data']): void => {
  if (!lines) return;

  console.log('');
  lines.forEach((line, index) => {
    console.log(`  ${index + 1}) ${line}`);
  });
  console.log('');
};

// Keys whose values are secrets, so must come from the environment.
const SENSITIVE_KEYS = new Set([
  'apiKey',
  'apiSecret',
  'secretKey',
  'apiToken',
]);
const ENV_REFERENCE = /^\$([A-Za-z0-9_]+)$/;

const builder = (yargs: Argv) =>
  yargs
    .option('config', {
      alias: 'c',
      type: 'string',
      describe: 'Site configuration',
    })
    .option('key', {
      alias: 'k',
      type: 'string',
      describe: 'Deploy key',
    })
    .option('endpoint', {
      alias: 'e',
      type: 'string',
      describe: 'API endpoint',
    })
    .option('force', {
      alias: 'f',
      type: 'boolean',
      default: false,
      describe:
        'Skip verifying that secrets reference environment variables and force the deployment via the API',
    })
    .option('file', {
      type: 'string',
      default: 'formspree.json',
      describe: 'Path to the local `formspree.json` file',
    });

const handler = async (args: Args<typeof builder>): Promise<void> => {
  const rawConfig = args.config || deployment.getRawConfig(args);
  const endpoint = args.endpoint || 'https://formspree.io';

  if (!rawConfig) {
    log.error('Configuration not provided');
    process.exitCode = 1;
    return;
  }

  let parsedRawConfig: unknown;

  try {
    parsedRawConfig = JSON.parse(rawConfig);
  } catch {
    log.error('Configuration could not be parsed');
    process.exitCode = 1;
    return;
  }

  // Traverse the config and validate that certain specially-named keys
  // reference environment variables.
  const invalidKeys: string[] = [];

  traverse(parsedRawConfig, (key, value) => {
    if (SENSITIVE_KEYS.has(key) && !ENV_REFERENCE.test(String(value))) {
      invalidKeys.push(key);
    }
  });

  if (!args.force && invalidKeys.length > 0) {
    log.error(
      `The following properties must reference environment variables: ${invalidKeys.join(
        ', ',
      )}`,
    );

    log.meta('To override this, use the `-f` flag.');

    process.exitCode = 1;
    return;
  }

  // Replace environment variable $-references with the actual values.
  // References to variables that aren't defined are collected and
  // reported together.
  const undefinedEnvRefs: string[] = [];

  const rawConfigWithSecrets = rawConfig.replace(
    /\$([A-Za-z0-9_]+)/gi,
    (_match, variableName: string) => {
      const value = process.env[variableName];
      if (value) return value;
      undefinedEnvRefs.push(variableName);
      return 'undefined';
    },
  );

  if (undefinedEnvRefs.length > 0) {
    log.error(
      `The following environment variables were referenced but are not defined: ${undefinedEnvRefs.join(
        ', ',
      )}`,
    );

    process.exitCode = 1;
    return;
  }

  let config: unknown;

  try {
    config = JSON.parse(rawConfigWithSecrets);
  } catch {
    log.error('Configuration could not be parsed');
    process.exitCode = 1;
    return;
  }

  const key = args.key || deployment.getDeployKey(args);

  if (!key) {
    messages.authRequired();
    process.exitCode = 1;
    return;
  }

  const spinner = spin.start('Deploying');

  try {
    const response = await deployment.request({
      endpoint,
      config,
      force: args.force,
      key,
      userAgent,
    });

    spinner.clear();

    switch (response.status) {
      case 200:
        log.success(
          `Deployment succeeded ${chalk.gray(`(${response.data.id})`)}`,
        );
        printDeployLog(response.data);
        return;

      case 401:
        log.error('Deploy key is not valid');
        process.exitCode = 1;
        return;

      case 422:
        log.error('Deployment failed');
        printErrors(response.data);
        process.exitCode = 1;
        return;

      default:
        log.error('Deployment failed');
        process.exitCode = 1;
    }
  } catch {
    spinner.clear();
    log.error('Deployment failed unexpectedly');
    process.exitCode = 1;
  }
};

export const command: Command<typeof builder> = {
  command: 'deploy',
  describe: 'Deploys formspree.json',
  builder,
  handler,
};
