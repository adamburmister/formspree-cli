import type { CommandModule } from 'yargs';
import { command as add } from './forms/add.ts';
import { command as create } from './forms/create.ts';
import { command as remove } from './forms/delete.ts';
import { command as get } from './forms/get.ts';
import { command as list } from './forms/list.ts';
import { command as update } from './forms/update.ts';
import { command as validate } from './forms/validate.ts';

export const command: CommandModule = {
  command: 'forms <command>',
  describe: 'Manage form resources',
  builder: (yargs) =>
    yargs
      .command(add)
      .command(create)
      .command(remove)
      .command(get)
      .command(list)
      .command(update)
      .command(validate)
      .example([
        ['$0 forms create "Contact" --email you@example.com', 'Creates a form'],
        ['$0 forms list --json', 'Lists your forms as JSON'],
        ['$0 forms create --help', "Shows one command's options and examples"],
      ]),
  handler: () => {},
};
