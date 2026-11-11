import type { CommandModule } from 'yargs';
import { command as create } from './projects/create.ts';
import { command as del } from './projects/delete.ts';
import { command as get } from './projects/get.ts';
import { command as list } from './projects/list.ts';
import { command as rename } from './projects/rename.ts';

export const command: CommandModule = {
  command: 'projects <command>',
  describe: 'Manage projects',
  builder: (yargs) =>
    yargs
      .command(create)
      .command(del)
      .command(get)
      .command(list)
      .command(rename)
      .example([
        ['$0 projects create "Marketing site"', 'Creates a project'],
        ['$0 projects list --json', 'Lists your projects as JSON'],
        [
          '$0 projects delete --help',
          "Shows one command's options and examples",
        ],
      ]),
  handler: () => {},
};
