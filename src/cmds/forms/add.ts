import type { Argv } from 'yargs';
import type { Args, Command } from '../../command.ts';
import { readConfig, writeConfig } from '../../config.ts';
import type { SiteConfig } from '../../config.ts';
import * as failure from '../../failure.ts';
import * as log from '../../log.ts';

const builder = (yargs: Argv) =>
  yargs
    .positional('key', {
      type: 'string',
      demandOption: true,
      describe: "The form's key in formspree.json",
    })
    .positional('name', {
      type: 'string',
      demandOption: true,
      describe: "The form's name",
    })
    .option('file', {
      type: 'string',
      default: 'formspree.json',
      describe: 'Path to the local `formspree.json` file',
    })
    .option('json', {
      type: 'boolean',
      describe: 'Print what was added, as JSON',
    });

const handler = (args: Args<typeof builder>): void => {
  let config: SiteConfig;
  try {
    config = readConfig(args.file);
  } catch {
    failure.report(args, {
      code: 'CONFIG_INVALID',
      message: `${args.file} could not be parsed`,
    });
    return;
  }
  const forms = (config.forms ??= {});

  if (forms[args.key]) {
    failure.report(
      args,
      { code: 'ALREADY_EXISTS', message: `${args.key} already exists` },
      () => log.error(`${log.variable(args.key)} already exists`),
    );
    return;
  }

  forms[args.key] = { name: args.name };
  writeConfig(args.file, config);

  if (args.json) {
    console.log(JSON.stringify({ added: args.key, file: args.file }, null, 2));
  } else {
    log.success(`${log.variable(args.key)} added`);
  }
};

export const command: Command<typeof builder> = {
  command: 'add <key> <name>',
  describe: 'Adds a new form to config',
  builder,
  handler,
};
