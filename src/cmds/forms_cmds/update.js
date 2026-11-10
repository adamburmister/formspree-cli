const log = require('../../log');
const v1 = require('../../v1');
const forms = require('../../forms');

exports.command = 'update <form>';
exports.desc =
  'Changes a form. Fields and actions you leave out stay as they are';

exports.builder = yargs => {
  forms
    .bodyOptions(v1.options(yargs))
    .positional('form', {
      type: 'string',
      describe: "The form's hashid"
    })
    .option('name', {
      type: 'string',
      describe: "The form's new name"
    });
};

exports.handler = v1.run(async args => {
  const data = forms.body(args);
  if (!Object.keys(data).length) {
    throw new v1.UsageError(
      'Nothing to change. Pass at least one option; see --help'
    );
  }

  const response = await v1.call(args, {
    method: 'patch',
    path: `/api/v1/forms/${v1.segment(args.form)}`,
    data
  });
  if (!response) return;

  v1.print(args, response, ({ form }) => {
    log.success(`Form updated: ${forms.line(form)}`);
    console.log('');
    forms.show(form);
  });
});
