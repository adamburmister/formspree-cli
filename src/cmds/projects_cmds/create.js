const log = require('../../log');
const v1 = require('../../v1');
const projects = require('../../projects');

exports.command = 'create [name]';
exports.desc = 'Creates a project';

exports.builder = yargs => {
  v1.idempotencyOption(v1.options(yargs))
    .positional('name', {
      type: 'string',
      describe: "The project's name"
    })
    .option('account', {
      type: 'string',
      describe:
        'The account to create it on, by its acct_ id. Needed only when you can use several'
    });
};

exports.handler = v1.run(async args => {
  const data = {};
  if (args.name !== undefined) data.name = args.name;
  if (args.account) data.account_id = args.account;

  const response = await v1.call(args, {
    method: 'post',
    path: '/api/v1/projects',
    data,
    headers: v1.idempotencyHeaders(args)
  });
  if (!response) return;

  v1.print(args, response, ({ project, next_steps }) => {
    if (v1.replayed(response)) {
      log.meta(
        'An earlier request used this idempotency key. Nothing new was created.'
      );
    }
    log.success(`Project created: ${projects.line(project)}`);
    console.log('');
    projects.show(project);
    v1.nextSteps(next_steps, {
      rewrite: {
        create_form: `Add a form to it: ${log.variable(
          `formspree forms create --project ${project.id}`
        )}`
      }
    });
  });
});
