const v1 = require('../../v1');
const projects = require('../../projects');

exports.command = 'get <project>';
exports.desc = 'Shows a project';

exports.builder = yargs => {
  v1.options(yargs).positional('project', {
    type: 'string',
    describe: "The project's id"
  });
};

exports.handler = v1.run(async args => {
  const response = await v1.call(args, {
    method: 'get',
    path: `/api/v1/projects/${v1.segment(args.project)}`
  });
  if (!response) return;

  v1.print(args, response, data => {
    console.log('');
    console.log(`  ${projects.line(data.project)}`);
    console.log('');
    projects.show(data.project);
  });
});
