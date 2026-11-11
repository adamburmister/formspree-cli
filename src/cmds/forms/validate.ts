import type { Argv } from 'yargs';
import type { Args, Command } from '../../command.ts';
import * as log from '../../log.ts';
import type { ValidationResult } from '../../types.ts';
import * as v1 from '../../v1.ts';

const builder = (yargs: Argv) =>
  yargs
    .positional('form', {
      type: 'string',
      demandOption: true,
      describe: "The form's hashid",
    })
    .positional('fields', {
      type: 'string',
      array: true,
      describe: 'The submission, as name=value pairs',
    })
    .option('from', {
      type: 'string',
      describe: 'A JSON file holding the submission. Pairs win',
    })
    .option('stdin', {
      type: 'boolean',
      describe: 'Read that JSON from stdin instead of a file',
    })
    .conflicts('from', 'stdin')
    .option('json', {
      type: 'boolean',
      describe: 'Print the API response as JSON',
    })
    .example(
      '$0 forms validate xyzabcde email=ada@example.com message=Hello',
      '',
    );

type ValidateArgs = Args<typeof builder>;

/**
 * The submission: the --from or --stdin JSON, with each name=value pair
 * set over it. A name given twice becomes a list, as in an HTML form.
 *
 * A field can be named anything, "constructor" and "__proto__" included,
 * so names are collected in a Map and defined as own properties rather
 * than read from or assigned through the object's prototype.
 */
const submission = (args: ValidateArgs): Record<string, unknown> => {
  const data = v1.input(args);
  const values = new Map<string, string | string[]>();

  for (const pair of args.fields ?? []) {
    const at = pair.indexOf('=');
    if (at < 1) {
      throw new v1.UsageError(
        `${pair} is not a name=value pair, like email=ada@example.com`,
      );
    }
    const name = pair.slice(0, at);
    const value = pair.slice(at + 1);
    const earlier = values.get(name);
    values.set(name, earlier === undefined ? value : [earlier, value].flat());
  }

  for (const [name, value] of values) {
    Object.defineProperty(data, name, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return data;
};

const handler = v1.run(async (args: ValidateArgs) => {
  const response = await v1.call<ValidationResult>(
    args,
    {
      method: 'post',
      path: `/api/v1/forms/${v1.segment(args.form)}/validate`,
      data: submission(args),
    },
    { anonymous: true },
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
    for (const error of errors) {
      console.error(`  ${log.variable(error.field)}: ${error.message}`);
    }
    console.error('');
  });
});

export const command: Command<typeof builder> = {
  command: 'validate <form> [fields..]',
  describe:
    "Checks a submission against a form's rules, storing nothing. Needs no login",
  builder,
  handler,
};
