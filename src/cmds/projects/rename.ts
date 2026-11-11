import type { Argv } from 'yargs';
import type { Args, Command } from '../../command.ts';
import * as log from '../../log.ts';
import * as projects from '../../projects.ts';
import type { ProjectResponse } from '../../types.ts';
import * as v1 from '../../v1.ts';

const builder = (yargs: Argv) =>
  v1
    .options(yargs)
    .positional('project', {
      type: 'string',
      demandOption: true,
      describe: "The project's id",
    })
    .positional('name', {
      type: 'string',
      demandOption: true,
      describe: 'Its new name',
    });

const handler = v1.run(async (args: Args<typeof builder>) => {
  const response = await v1.call<ProjectResponse>(args, {
    method: 'patch',
    path: `/api/v1/projects/${v1.segment(args.project)}`,
    data: { name: args.name },
  });
  if (!response) return;

  v1.print(args, response, ({ project }) => {
    log.success(`Project renamed: ${projects.line(project)}`);
  });
});

export const command: Command<typeof builder> = {
  command: 'rename <project> <name>',
  describe: 'Renames a project',
  builder,
  handler,
};
