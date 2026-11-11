import type { Argv } from 'yargs';
import type { Args, Command } from '../../command.ts';
import { readConfig, writeConfig } from '../../config.ts';
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
    });

const handler = (args: Args<typeof builder>): void => {
  const config = readConfig(args.file);
  const forms = (config.forms ??= {});

  if (forms[args.key]) {
    log.error(`${log.variable(args.key)} already exists`);
    return;
  }

  forms[args.key] = { name: args.name };
  writeConfig(args.file, config);
  log.success(`${log.variable(args.key)} added`);
};

export const command: Command<typeof builder> = {
  command: 'add <key> <name>',
  describe: 'Adds a new form to config',
  builder,
  handler,
};
