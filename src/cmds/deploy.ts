import deployment from '@formspree/deploy';
import { JSON_BY_DEFAULT } from '../agent.ts';
import type { DeployResponse } from '@formspree/deploy';
import chalk from 'chalk';
import type { Argv } from 'yargs';
import type { Args, Command } from '../command.ts';
import { withExamples } from '../command.ts';
import * as failure from '../failure.ts';
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
    })
    .option('json', {
      type: 'boolean',
      describe: `Print the deployment's result as JSON. ${JSON_BY_DEFAULT}`,
    });

const handler = async (args: Args<typeof builder>): Promise<void> => {
  const rawConfig = args.config || deployment.getRawConfig(args);
  const endpoint = args.endpoint || 'https://formspree.io';

  if (!rawConfig) {
    failure.report(args, {
      code: 'CONFIG_MISSING',
      message: 'Configuration not provided',
      next: [
        {
          step: 'create_config',
          detail: 'Create a formspree.json to deploy.',
          command: 'formspree init',
        },
      ],
    });
    return;
  }

  let parsedRawConfig: unknown;

  try {
    parsedRawConfig = JSON.parse(rawConfig);
  } catch {
    failure.report(args, {
      code: 'CONFIG_INVALID',
      message: 'Configuration could not be parsed',
    });
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
    const message = `The following properties must reference environment variables: ${invalidKeys.join(
      ', ',
    )}`;
    failure.report(
      args,
      {
        code: 'CONFIG_INVALID',
        message,
        next: [
          {
            step: 'reference_env',
            detail:
              'Set each property to $NAME, the name of an environment variable that holds its value. The -f flag overrides this check.',
          },
        ],
        extra: { properties: invalidKeys },
      },
      () => {
        log.error(message);
        log.meta('To override this, use the `-f` flag.');
      },
    );
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
    failure.report(args, {
      code: 'CONFIG_INVALID',
      message: `The following environment variables were referenced but are not defined: ${undefinedEnvRefs.join(
        ', ',
      )}`,
      extra: { variables: undefinedEnvRefs },
    });
    return;
  }

  let config: unknown;

  try {
    config = JSON.parse(rawConfigWithSecrets);
  } catch {
    failure.report(args, {
      code: 'CONFIG_INVALID',
      message: 'Configuration could not be parsed',
    });
    return;
  }

  const key = args.key || deployment.getDeployKey(args);

  if (!key) {
    failure.report(
      args,
      {
        code: 'DEPLOY_KEY_REQUIRED',
        message: 'Deploy key is required',
        next: [
          {
            step: 'set_deploy_key',
            detail:
              'Set FORMSPREE_DEPLOY_KEY to the deploy key found under "Settings" in the dashboard, or pass it with -k.',
          },
        ],
      },
      messages.authRequired,
    );
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
        if (args.json) {
          console.log(JSON.stringify(response.data, null, 2));
          return;
        }
        log.success(
          `Deployment succeeded ${chalk.gray(`(${response.data.id})`)}`,
        );
        printDeployLog(response.data);
        return;

      case 401:
        failure.report(args, {
          code: 'INVALID_DEPLOY_KEY',
          message: 'Deploy key is not valid',
        });
        return;

      case 422:
        failure.report(
          args,
          {
            code: 'DEPLOY_FAILED',
            message: 'Deployment failed',
            // What the server found wrong with the configuration.
            extra: {
              status: response.status,
              reason: response.data.code,
              errors: response.data.errors ?? [],
            },
          },
          () => {
            log.error('Deployment failed');
            printErrors(response.data);
          },
        );
        return;

      default:
        failure.report(args, {
          code: 'DEPLOY_FAILED',
          message: 'Deployment failed',
          retryable: response.status >= 500,
          extra: { status: response.status },
        });
    }
  } catch {
    spinner.clear();
    failure.report(args, {
      code: 'DEPLOY_FAILED',
      message: 'Deployment failed unexpectedly',
      retryable: true,
    });
  }
};

export const command: Command<typeof builder> = {
  command: 'deploy',
  describe: 'Deploys formspree.json',
  builder: withExamples(builder, [
    [
      '$0 deploy -k <deploy-key>',
      'Deploys the formspree.json in this directory',
    ],
    [
      '$0 deploy --json',
      'Prints the result as JSON, with the key in FORMSPREE_DEPLOY_KEY',
    ],
  ]),
  handler,
};
