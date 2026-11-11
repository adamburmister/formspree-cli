import type { Argv } from 'yargs';
import type { Args, Command } from '../../command.ts';
import * as log from '../../log.ts';
import * as projects from '../../projects.ts';
import type { ProjectsResponse } from '../../types.ts';
import * as v1 from '../../v1.ts';

const builder = (yargs: Argv) =>
  v1.options(yargs).option('account', {
    type: 'string',
    describe: "Only this account's projects, by its acct_ id",
  });

const handler = v1.run(async (args: Args<typeof builder>) => {
  const response = await v1.call<ProjectsResponse>(args, {
    method: 'get',
    path: '/api/v1/projects',
    params: args.account ? { account_id: args.account } : undefined,
  });
  if (!response) return;

  v1.print(args, response, (data) => {
    if (!data.projects.length) {
      log.meta('No projects yet');
      return;
    }

    console.log('');
    for (const project of data.projects) {
      console.log(`  ${projects.line(project)}`);
    }
    console.log('');
  });
});

export const command: Command<typeof builder> = {
  command: 'list',
  describe: 'Lists your projects',
  builder,
  handler,
};
