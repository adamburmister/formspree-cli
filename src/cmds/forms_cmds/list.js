const chalk = require('chalk');
const log = require('../../log');
const v1 = require('../../v1');
const forms = require('../../forms');

exports.command = 'list';
exports.desc = 'Lists your forms';

exports.builder = yargs => {
  v1.options(yargs).option('project', {
    type: 'string',
    describe: "Only this project's forms, by its id"
  });
};

exports.handler = v1.run(async args => {
  const response = await v1.call(args, {
    method: 'get',
    path: '/api/v1/forms',
    params: args.project ? { project_id: args.project } : undefined
  });
  if (!response) return;

  v1.print(args, response, data => {
    if (!data.forms.length) {
      log.meta('No forms yet');
      return;
    }

    console.log('');
    data.forms.forEach(form => {
      console.log(`  ${forms.line(form)}  ${chalk.gray(form.url)}`);
    });
    console.log('');
  });
});
