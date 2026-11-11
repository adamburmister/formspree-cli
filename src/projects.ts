import chalk from 'chalk';
import * as accounts from './accounts.ts';
import * as log from './log.ts';
import * as prompt from './prompt.ts';
import type { Prompts } from './prompt.ts';
import * as terminal from './terminal.ts';
import type { Account, Project } from './types.ts';
import * as v1 from './v1.ts';

/** What `projects create` already knows before it asks anything. */
export interface KnownProject {
  name?: string | undefined;
  account?: string | undefined;
  accounts: readonly Account[];
}

/** What the questions add, under the options' names. */
export interface ProjectAnswers {
  name?: string;
  account?: string;
}

/** A project's name, as the lists and questions show it. */
export const title = (project: Project): string =>
  project.name || 'Untitled project';

/** A project on one line, as the lists show it. */
export const line = (project: Project): string =>
  `${title(project)} ${chalk.gray(`(${project.id})`)}`;

/**
 * A project that was just created, on one line: as `line`, with its id in
 * the Formspree red, since that's what to copy.
 */
export const created = (project: Project): string =>
  `${title(project)} ${chalk.gray('(')}${log.id(project.id)}${chalk.gray(')')}`;

const details = (project: Project): v1.Pairs => {
  const dashboard = project.links?.dashboard;

  return [
    ['Account', project.account_id],
    ['Kind', project.kind],
    ['Timezone', project.timezone],
    ['Allowed domains', project.domain_whitelist],
    ['Dashboard', dashboard && chalk.cyan(dashboard)],
  ];
};

/** Prints one project's details. */
export const show = (project: Project): void => {
  v1.rows(details(project));
};

/**
 * Prints a new project as a note: that it was created, as the title, over
 * its details. With `guide` the note is drawn as part of the questions
 * that led to the project.
 */
export const note = (
  project: Project,
  options: { guide?: boolean } = {},
): void => {
  const title = `Project created: ${created(project)}`;
  const rows = v1.table(details(project));

  // Piped somewhere, it's said as every other result is, with no frame.
  if (!terminal.styled(process.stdout)) {
    log.success(title);
    console.log('');
    for (const row of rows) console.log(`  ${row}`);
    return;
  }

  prompt.note(rows.join('\n'), title, options);
};

/**
 * Asks which of `choices` is meant, with `message` saying what for.
 * Resolves with the project.
 */
export const pick = (
  p: Prompts,
  message: string,
  choices: readonly Project[],
): Promise<Project> =>
  p.select<Project>({
    message,
    options: choices.map((project) => ({
      value: project,
      label: title(project),
      hint: project.id,
    })),
    maxItems: 10,
  });

const needsAccount = ({ account, accounts: choices }: KnownProject): boolean =>
  account === undefined && choices.length > 1;

/**
 * Whether `projects create` has anything to ask: the name, or the account
 * when there are several to choose from.
 */
export const hasQuestions = (known: KnownProject): boolean =>
  known.name === undefined || needsAccount(known);

/** Asks for what `projects create` wasn't given. */
export const ask = async (
  p: Prompts,
  known: KnownProject,
): Promise<ProjectAnswers> => {
  const answers: ProjectAnswers = {};

  if (known.name === undefined) {
    answers.name = await p.text({
      message: 'Project name',
      placeholder: 'New Project',
      defaultValue: 'New Project',
    });
  }
  if (needsAccount(known)) {
    answers.account = await accounts.pick(p, known.accounts);
  }

  return answers;
};
