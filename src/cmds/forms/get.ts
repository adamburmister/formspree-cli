import type { Argv } from 'yargs';
import type { Args, Command } from '../../command.ts';
import * as forms from '../../forms.ts';
import type { FormResponse } from '../../types.ts';
import * as v1 from '../../v1.ts';

const builder = (yargs: Argv) =>
  v1.options(yargs).positional('form', {
    type: 'string',
    demandOption: true,
    describe: "The form's hashid",
  });

const handler = v1.run(async (args: Args<typeof builder>) => {
  const response = await v1.call<FormResponse>(args, {
    method: 'get',
    path: `/api/v1/forms/${v1.segment(args.form)}`,
  });
  if (!response) return;

  v1.print(args, response, ({ form }) => {
    console.log('');
    console.log(`  ${forms.line(form)}`);
    console.log('');
    forms.show(form);
  });
});

export const command: Command<typeof builder> = {
  command: 'get <form>',
  describe: 'Shows a form with its fields and actions',
  builder,
  handler,
};
