import chalk from 'chalk';
import type { Argv } from 'yargs';
import type { Args, Command } from '../../command.ts';
import * as forms from '../../forms.ts';
import * as log from '../../log.ts';
import type { FormsResponse } from '../../types.ts';
import * as v1 from '../../v1.ts';

const builder = (yargs: Argv) =>
  v1.options(yargs).option('project', {
    type: 'string',
    describe: "Only this project's forms, by its id",
  });

const handler = v1.run(async (args: Args<typeof builder>) => {
  const response = await v1.call<FormsResponse>(args, {
    method: 'get',
    path: '/api/v1/forms',
    params: args.project ? { project_id: args.project } : undefined,
  });
  if (!response) return;

  v1.print(args, response, (data) => {
    if (!data.forms.length) {
      log.meta('No forms yet');
      return;
    }

    console.log('');
    for (const form of data.forms) {
      console.log(`  ${forms.line(form)}  ${chalk.gray(form.url)}`);
    }
    console.log('');
  });
});

export const command: Command<typeof builder> = {
  command: 'list',
  describe: 'Lists your forms',
  builder,
  handler,
};
