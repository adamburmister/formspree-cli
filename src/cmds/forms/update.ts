import type { Argv } from 'yargs';
import type { Args, Command } from '../../command.ts';
import * as forms from '../../forms.ts';
import * as log from '../../log.ts';
import type { FormResponse } from '../../types.ts';
import * as v1 from '../../v1.ts';

const builder = (yargs: Argv) =>
  forms
    .bodyOptions(v1.options(yargs))
    .positional('form', {
      type: 'string',
      demandOption: true,
      describe: "The form's hashid",
    })
    .option('name', {
      type: 'string',
      describe: "The form's new name",
    });

const handler = v1.run(async (args: Args<typeof builder>) => {
  const data = forms.body(args);
  if (!Object.keys(data).length) {
    throw new v1.UsageError(
      'Nothing to change. Pass at least one option; see --help',
    );
  }

  const response = await v1.call<FormResponse>(args, {
    method: 'patch',
    path: `/api/v1/forms/${v1.segment(args.form)}`,
    data,
  });
  if (!response) return;

  v1.print(args, response, ({ form }) => {
    log.success(`Form updated: ${forms.line(form)}`);
    console.log('');
    forms.show(form);
  });
});

export const command: Command<typeof builder> = {
  command: 'update <form>',
  describe: 'Changes a form. Fields and actions you leave out stay as they are',
  builder,
  handler,
};
