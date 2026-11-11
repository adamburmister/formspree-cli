import { writeFile } from 'node:fs/promises';
import type { CommandModule } from 'yargs';
import * as log from '../log.ts';
import { errorCode } from '../util.ts';

export const command: CommandModule = {
  command: 'init',
  describe: 'Creates a formspree.json file',
  handler: async () => {
    try {
      await writeFile('formspree.json', '{}', { flag: 'wx' });
      log.success('formspree.json created');
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
      log.success('formspree.json already exists');
    }
  },
};
