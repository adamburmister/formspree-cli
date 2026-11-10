const readline = require('readline');
const log = require('../../log');
const v1 = require('../../v1');

exports.command = 'delete <form>';
exports.desc = 'Deletes a form and its submissions';

exports.builder = yargs => {
  v1.options(yargs)
    .positional('form', {
      type: 'string',
      describe: "The form's hashid"
    })
    .option('yes', {
      alias: 'y',
      type: 'boolean',
      describe: 'Delete without asking first'
    });
};

const confirm = question => {
  return new Promise(resolve => {
    const prompt = readline.createInterface({
      input: process.stdin,
      output: process.stderr
    });
    prompt.question(question, answer => {
      prompt.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
};

exports.handler = v1.run(async args => {
  if (!args.yes) {
    if (!process.stdin.isTTY) {
      throw new v1.UsageError(
        'Pass --yes to delete a form when nobody can confirm it'
      );
    }
    const agreed = await confirm(
      `Delete form ${args.form} and its submissions? (y/N) `
    );
    if (!agreed) {
      log.meta('Nothing deleted');
      return;
    }
  }

  const response = await v1.call(args, {
    method: 'delete',
    path: `/api/v1/forms/${v1.segment(args.form)}`
  });
  if (!response) return;

  if (args.json) {
    console.log(JSON.stringify({ deleted: args.form }, null, 2));
  } else {
    log.success(`Form deleted: ${args.form}`);
  }
});
