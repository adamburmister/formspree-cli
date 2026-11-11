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
      .command(rename),
  handler: () => {},
};
