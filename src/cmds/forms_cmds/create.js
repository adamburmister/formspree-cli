const log = require('../../log');
const v1 = require('../../v1');
const forms = require('../../forms');

exports.command = 'create [name]';
exports.desc = 'Creates a form on Formspree';

exports.builder = yargs => {
  forms
    .bodyOptions(v1.interactiveOption(v1.idempotencyOption(v1.options(yargs))))
    .positional('name', {
      type: 'string',
      describe: "The form's name"
    })
    .option('project', {
      type: 'string',
      describe: 'The project to create it in, by its id'
    })
    .option('project-name', {
      type: 'string',
      describe:
        'The project to create it in, by name. Made if missing. Without either, the form lands in "Default Project"'
    })
    .option('account', {
      type: 'string',
      describe:
        'The account to create it on, by its acct_ id. Needed only when you can use several'
    })
    .conflicts('project', ['project-name', 'account']);
};

// The options that describe the form. With none of them, in a terminal,
// the command asks instead.
const OPTIONS = [
  'project',
  'projectName',
  'account',
  'formKey',
  'email',
  'webhook',
  'app',
  'redirect',
  'recaptcha',
  'from',
  'stdin'
];

exports.handler = v1.run(async given => {
  let args = given;

  if (v1.asks(args, OPTIONS)) {
    const owners = await v1.call(args, {
      method: 'get',
      path: '/api/v1/accounts'
    });
    if (!owners) return;

    // A login that can't list projects can still name one.
    const listed = await v1.call(
      args,
      { method: 'get', path: '/api/v1/projects' },
      { optional: true }
    );

    const answers = await forms.ask({
      name: args.name,
      accounts: owners.data.accounts,
      projects: listed ? listed.data.projects : []
    });
    args = Object.assign({}, args, answers);
  }

  const data = forms.body(args);
  if (args.project !== undefined) data.project_id = args.project;
  if (args.projectName !== undefined) data.project = args.projectName;
  if (args.account !== undefined) data.account_id = args.account;

  const response = await v1.call(args, {
    method: 'post',
    path: '/api/v1/forms',
    data,
    headers: v1.idempotencyHeaders(args)
  });
  if (!response) return;

  v1.print(args, response, ({ form, next_steps }) => {
    if (v1.replayed(response)) {
      log.meta(
        'An earlier request used this idempotency key. Nothing new was created.'
      );
    }
    log.success(`Form created: ${forms.line(form)}`);
    console.log('');
    forms.show(form);
    v1.nextSteps(next_steps);
  });
});
