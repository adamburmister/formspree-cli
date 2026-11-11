import chalk from 'chalk';
import * as accounts from './accounts.ts';
import type { Prompts } from './prompt.ts';
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

/** A project on one line, as the lists show it. */
export const line = (project: Project): string =>
  `${project.name || 'Untitled project'} ${chalk.gray(`(${project.id})`)}`;

/** Prints one project's details. */
export const show = (project: Project): void => {
  const dashboard = project.links?.dashboard;

  v1.rows([
    ['Account', project.account_id],
    ['Kind', project.kind],
    ['Timezone', project.timezone],
    ['Allowed domains', project.domain_whitelist],
    ['Dashboard', dashboard && chalk.cyan(dashboard)],
  ]);
};

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
      message: 'Name',
      placeholder: 'New Project',
      defaultValue: 'New Project',
    });
  }
  if (needsAccount(known)) {
    answers.account = await accounts.pick(p, known.accounts);
  }

  return answers;
};
