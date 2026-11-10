const log = require('../../log');
const v1 = require('../../v1');

exports.command = 'validate <form> [fields..]';
exports.desc =
  "Checks a submission against a form's rules, storing nothing. Needs no login";

exports.builder = yargs => {
  yargs
    .positional('form', {
      type: 'string',
      describe: "The form's hashid"
    })
    .positional('fields', {
      type: 'string',
      describe: 'The submission, as name=value pairs'
    })
    .option('from', {
      type: 'string',
      describe: 'A JSON file holding the submission. Pairs win'
    })
    .option('stdin', {
      type: 'boolean',
      describe: 'Read that JSON from stdin instead of a file'
    })
    .conflicts('from', 'stdin')
    .option('json', {
      type: 'boolean',
      describe: 'Print the API response as JSON'
    })
    .example('$0 forms validate xyzabcde email=ada@example.com message=Hello');
};

/**
 * The submission: the --from or --stdin JSON, with each name=value pair set over it.
 * A name given twice becomes a list, as in an HTML form.
 */
const submission = args => {
  const data = v1.input(args);
  const seen = {};

  [].concat(args.fields || []).forEach(pair => {
    const at = String(pair).indexOf('=');
    if (at < 1) {
      throw new v1.UsageError(
        `${pair} is not a name=value pair, like email=ada@example.com`
      );
    }
    const name = pair.slice(0, at);
    const value = pair.slice(at + 1);
    data[name] = seen[name] ? [].concat(data[name], value) : value;
    seen[name] = true;
  });

  return data;
};

exports.handler = v1.run(async args => {
  const response = await v1.call(
    args,
    {
      method: 'post',
      path: `/api/v1/forms/${v1.segment(args.form)}/validate`,
      data: submission(args)
    },
    { anonymous: true }
  );
  if (!response) return;

  if (!response.data.valid) process.exitCode = 1;

  v1.print(args, response, ({ valid, errors }) => {
    if (valid) {
      log.success('The submission is valid');
      return;
    }

    log.error('The submission is not valid');
    console.error('');
    errors.forEach(error => {
      console.error(`  ${log.variable(error.field)}: ${error.message}`);
    });
    console.error('');
  });
});
