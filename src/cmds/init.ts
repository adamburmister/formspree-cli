import { writeFile } from 'node:fs/promises';
import { JSON_BY_DEFAULT } from '../agent.ts';
import type { Argv } from 'yargs';
import type { Args, Command } from '../command.ts';
import { withExamples } from '../command.ts';
import * as log from '../log.ts';
import { errorCode } from '../util.ts';

const FILE = 'formspree.json';

const builder = (yargs: Argv) =>
  yargs.option('json', {
    type: 'boolean',
    describe: `Print whether the file was created, as JSON. ${JSON_BY_DEFAULT}`,
  });

const handler = async (args: Args<typeof builder>): Promise<void> => {
  let created = true;
  try {
    await writeFile(FILE, '{}', { flag: 'wx' });
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error;
    created = false;
  }

  if (args.json) {
    console.log(JSON.stringify({ created, file: FILE }, null, 2));
  } else {
    log.success(created ? `${FILE} created` : `${FILE} already exists`);
  }
};

export const command: Command<typeof builder> = {
  command: 'init',
  describe: 'Creates a formspree.json file',
  builder: withExamples(builder, [
    ['$0 init', 'Creates an empty formspree.json here'],
  ]),
  handler,
};
