const log = require('../../log');
const v1 = require('../../v1');
const projects = require('../../projects');

exports.command = 'rename <project> <name>';
exports.desc = 'Renames a project';

exports.builder = yargs => {
  v1.options(yargs)
    .positional('project', {
      type: 'string',
      describe: "The project's id"
    })
    .positional('name', {
      type: 'string',
      describe: 'Its new name'
    });
};

exports.handler = v1.run(async args => {
  const response = await v1.call(args, {
    method: 'patch',
    path: `/api/v1/projects/${v1.segment(args.project)}`,
    data: { name: args.name }
  });
  if (!response) return;

  v1.print(args, response, data => {
    log.success(`Project renamed: ${projects.line(data.project)}`);
  });
});
