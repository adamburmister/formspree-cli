const log = require('../../log');
const v1 = require('../../v1');
const projects = require('../../projects');

exports.command = 'create [name]';
exports.desc = 'Creates a project';

exports.builder = yargs => {
  v1.interactiveOption(v1.idempotencyOption(v1.options(yargs)))
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

// The options that describe the project. With none of them, in a
// terminal, the command asks instead.
const OPTIONS = ['account'];

exports.handler = v1.run(async given => {
  let args = given;

  if (v1.asks(args, OPTIONS)) {
    const listed = await v1.call(args, {
      method: 'get',
      path: '/api/v1/accounts'
    });
    if (!listed) return;

    const answers = await projects.ask({
      name: args.name,
      accounts: listed.data.accounts
    });
    args = Object.assign({}, args, answers);
  }

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
