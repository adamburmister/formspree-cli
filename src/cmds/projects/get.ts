import type { Argv } from 'yargs';
import type { Args, Command } from '../../command.ts';
import * as projects from '../../projects.ts';
import type { ProjectResponse } from '../../types.ts';
import * as v1 from '../../v1.ts';

const builder = (yargs: Argv) =>
  v1.options(yargs).positional('project', {
    type: 'string',
    demandOption: true,
    describe: "The project's id",
  });

const handler = v1.run(async (args: Args<typeof builder>) => {
  const response = await v1.call<ProjectResponse>(args, {
    method: 'get',
    path: `/api/v1/projects/${v1.segment(args.project)}`,
  });
  if (!response) return;

  v1.print(args, response, ({ project }) => {
    console.log('');
    console.log(`  ${projects.line(project)}`);
    console.log('');
    projects.show(project);
  });
});

export const command: Command<typeof builder> = {
  command: 'get <project>',
  describe: 'Shows a project',
  builder,
  handler,
};
