const v1 = require('../../v1');
const forms = require('../../forms');

exports.command = 'get <form>';
exports.desc = 'Shows a form with its fields and actions';

exports.builder = yargs => {
  v1.options(yargs).positional('form', {
    type: 'string',
    describe: "The form's hashid"
  });
};

exports.handler = v1.run(async args => {
  const response = await v1.call(args, {
    method: 'get',
    path: `/api/v1/forms/${v1.segment(args.form)}`
  });
  if (!response) return;

  v1.print(args, response, data => {
    console.log('');
    console.log(`  ${forms.line(data.form)}`);
    console.log('');
    forms.show(data.form);
  });
});
