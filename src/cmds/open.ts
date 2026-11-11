import chalk from 'chalk';
import type { Argv } from 'yargs';
import * as browser from '../browser.ts';
import type { Args, Command } from '../command.ts';
import * as failure from '../failure.ts';
import * as forms from '../forms.ts';
import * as log from '../log.ts';
import * as oauth from '../oauth.ts';
import type { FormResponse, ProjectResponse } from '../types.ts';
import * as v1 from '../v1.ts';

const DOCS = 'https://help.formspree.io';

const builder = (yargs: Argv) =>
  v1
    .options(yargs)
    .positional('target', {
      type: 'string',
      describe:
        "What to open: a form's hashid, a project's id, or `docs` for the help site. Leave it out for the dashboard",
    })
    .option('url', {
      type: 'boolean',
      describe: 'Print the link, and nothing else, without opening it',
    });

type OpenArgs = Args<typeof builder>;

/** A project's id is `proj_…` or a bare number; anything else is a form. */
const isProject = (id: string): boolean => /^(proj_|\d+$)/.test(id);

/**
 * The page to open. A form or project is looked up, since its page is
 * where the API says it is. Resolves with undefined when it can't be
 * found, which has been reported by then.
 */
const page = async (args: OpenArgs): Promise<string | undefined> => {
  const { target } = args;
  if (target === undefined) return `${oauth.endpoint()}/forms`;
  if (target === 'docs') return DOCS;

  // With --url, stdout is for the link alone.
  const quiet = Boolean(args.url);

  if (isProject(target)) {
    const response = await v1.call<ProjectResponse>(
      args,
      { method: 'get', path: `/api/v1/projects/${v1.segment(target)}` },
      { quiet },
    );
    if (!response) return undefined;

    const dashboard = response.data.project.links?.dashboard;
    if (!dashboard) {
      failure.report(args, {
        code: 'NO_DASHBOARD_LINK',
        message: 'The API gave no dashboard link for this project',
      });
    }
    return dashboard;
  }

  const response = await v1.call<FormResponse>(
    args,
    { method: 'get', path: `/api/v1/forms/${v1.segment(target)}` },
    { quiet },
  );
  return response ? forms.dashboardUrl(response.data.form) : undefined;
};

const handler = v1.run(async (args: OpenArgs) => {
  const url = await page(args);
  if (!url) return;

  if (args.json) {
    console.log(JSON.stringify({ url }, null, 2));
    return;
  }
  // Off a terminal there's nobody to open a browser for: the link is
  // what the command has to give.
  if (args.url || !browser.available()) {
    console.log(url);
    return;
  }

  log.progress(`Opening ${chalk.cyan(url)}`);
  if (!(await browser.open(url))) {
    log.error("Couldn't open a browser. Open the link above yourself");
    process.exitCode = 1;
  }
});

export const command: Command<typeof builder> = {
  command: 'open [target]',
  describe:
    'Opens the dashboard, a form, a project or the docs in your browser',
  builder,
  handler,
};
