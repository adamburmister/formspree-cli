const log = require('../../log');
const v1 = require('../../v1');
const projects = require('../../projects');

exports.command = 'list';
exports.desc = 'Lists your projects';

exports.builder = yargs => {
  v1.options(yargs).option('account', {
    type: 'string',
    describe: "Only this account's projects, by its acct_ id"
  });
};

exports.handler = v1.run(async args => {
  const response = await v1.call(args, {
    method: 'get',
    path: '/api/v1/projects',
    params: args.account ? { account_id: args.account } : undefined
  });
  if (!response) return;

  v1.print(args, response, data => {
    if (!data.projects.length) {
      log.meta('No projects yet');
      return;
    }

    console.log('');
    data.projects.forEach(project => {
      console.log(`  ${projects.line(project)}`);
    });
    console.log('');
  });
});
