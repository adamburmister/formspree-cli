import chalk from 'chalk';
import type { Option } from '@clack/prompts';
import type { Argv } from 'yargs';
import * as accounts from './accounts.ts';
import * as log from './log.ts';
import * as projects from './projects.ts';
import * as prompt from './prompt.ts';
import type { Prompts } from './prompt.ts';
import * as terminal from './terminal.ts';
import type {
  Account,
  ActionInput,
  FieldRules,
  FieldType,
  FormAction,
  FormBody,
  FormDetail,
  FormSummary,
  Project,
} from './types.ts';
import * as v1 from './v1.ts';

/** A form's name, as the lists and questions show it. */
export const title = (form: FormSummary): string =>
  form.name || 'Untitled form';

/** A form on one line, as the lists show it. */
export const line = (form: FormSummary): string =>
  `${title(form)} ${chalk.gray(`(${form.hashid})`)}`;

/**
 * A form that was just created, on one line: as `line`, with its hashid
 * in the Formspree red, since that's what to copy.
 */
export const created = (form: FormSummary): string =>
  `${title(form)} ${chalk.gray('(')}${log.id(form.hashid)}${chalk.gray(')')}`;

const status = (value: FormAction['status']): string => {
  const text = value.replaceAll('_', ' ');
  return value === 'active' ? chalk.green(text) : chalk.yellow(text);
};

const action = (item: FormAction): string => {
  const name = item.app ?? item.type ?? 'action';
  const to = item.to?.length ? ` to ${item.to.join(', ')}` : '';
  return `${name}${to} ${chalk.gray('·')} ${status(item.status)}`;
};

const rule = (name: string, rules: FieldRules = {}): string => {
  const parts = Object.entries(rules).map(([key, value]) => {
    if (value === true) return key;
    return `${key} ${Array.isArray(value) ? value.join(' ') : value}`;
  });
  return parts.length ? `${name} ${chalk.gray(parts.join(', '))}` : name;
};

const captcha = (form: FormDetail): string | null => {
  if (form.captcha === undefined) return null;
  return form.captcha ? 'on' : 'off';
};

const details = (form: FormDetail): v1.Pairs => {
  const dashboard = form.links?.dashboard;

  return [
    ['Submit to', chalk.cyan(form.submission_url || form.url)],
    ['Project', form.project_id],
    ['Key', form.key],
    [
      'Fields',
      Object.entries(form.fields ?? {}).map(([name, rules]) =>
        rule(name, rules),
      ),
    ],
    ['reCAPTCHA', captcha(form)],
    ['Actions', (form.actions ?? []).map(action)],
    ['Dashboard', dashboard && chalk.cyan(dashboard)],
  ];
};

/** Prints one form's details. */
export const show = (form: FormDetail): void => {
  v1.rows(details(form));
};

const escape = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

// The input type for each type a field's rules can name.
const INPUT_TYPES: Record<FieldType, string> = {
  text: 'text',
  email: 'email',
  numeric: 'number',
  'datetime-local': 'datetime-local',
  url: 'url',
  file: 'file',
};

// The dashboard's example fields. The snippet always has them: a form's
// rules say what its fields must be, not which fields it has.
const EXAMPLE_LABELS: Record<string, string> = {
  email: 'Your email',
  message: 'Your message',
};

const label = (name: string): string =>
  EXAMPLE_LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1);

const control = (name: string, rules: FieldRules): string => {
  const required = rules.required ? ' required' : '';
  // A message is free text, unless the form's rules give it another type:
  // a file, say, which a textarea couldn't send.
  if (name === 'message' && (!rules.type || rules.type === 'text')) {
    return `<textarea name="message"${required}></textarea>`;
  }
  const type = (rules.type && INPUT_TYPES[rules.type]) || 'text';
  return `<input type="${type}" name="${escape(name)}"${required}>`;
};

/**
 * The HTML to paste into a site, as the dashboard shows it for a new form:
 * an email and a message. A form with field rules also gets an input for
 * each field they name, with its type and whether it's required, so the
 * snippet passes the form's own validation. The message comes last.
 */
export const snippet = (
  form: Pick<FormDetail, 'fields' | 'submission_url' | 'url'>,
): string => {
  const rules = form.fields ?? {};
  const named = Object.keys(rules).filter((name) => name !== 'message');
  const names = [
    ...named,
    ...(named.includes('email') ? [] : ['email']),
    'message',
  ];
  const fields = names.map((name) => ({
    name,
    rules: rules[name] ?? (name === 'email' ? { type: 'email' as const } : {}),
  }));
  const uploads = fields.some((field) => field.rules.type === 'file');

  return [
    '<!-- modify this form HTML and place wherever you want your form -->',
    '<form',
    `  action="${escape(form.submission_url || form.url)}"`,
    '  method="POST"',
    ...(uploads ? ['  enctype="multipart/form-data"'] : []),
    '>',
    ...fields.flatMap((field) => [
      '  <label>',
      `    ${escape(label(field.name))}:`,
      `    ${control(field.name, field.rules)}`,
      '  </label>',
    ]),
    '  <!-- your other form fields go here -->',
    '  <button type="submit">Send</button>',
    '</form>',
  ].join('\n');
};

/**
 * Colors the snippet's HTML: comments, tags, attribute names and values.
 * It changes no characters, so the text copies as it is.
 */
const highlight = (html: string): string =>
  html
    .split('\n')
    .map((line) => {
      if (/^\s*<!--/.test(line)) return chalk.gray(line);

      return line
        .replace(
          /([\w-]+)=("[^"]*")/g,
          (_match, name: string, value: string) =>
            `${chalk.yellow(name)}=${chalk.green(value)}`,
        )
        .replace(/ required(?=>)/g, ` ${chalk.yellow('required')}`)
        .replace(
          /(<\/?)([a-z]+)/g,
          (_match, open: string, name: string) =>
            `${chalk.gray(open)}${chalk.cyan(name)}`,
        )
        .replace(/>/g, chalk.gray('>'));
    })
    .join('\n');

/**
 * The form's page in the dashboard: where the API says it is, else worked
 * out from the form's endpoint.
 */
export const dashboardUrl = (form: FormDetail): string =>
  form.links?.dashboard ||
  (form.submission_url || form.url).replace(/\/f\/([^/]+)$/, '/forms/$1');

/**
 * Where the dashboard keeps more snippets for the form: React, Ajax and
 * the rest.
 */
const examplesUrl = (form: FormDetail): string =>
  `${dashboardUrl(form)}/integration`;

/**
 * Prints a new form as a note: that it was created, as the title, over
 * its details. With `guide` the note is drawn as part of the questions
 * that led to the form.
 */
export const note = (
  form: FormDetail,
  options: { guide?: boolean } = {},
): void => {
  const title = `Form created: ${created(form)}`;
  const rows = v1.table(details(form));

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
 * Prints how to put a new form on a site: the snippet, and the link to
 * more examples. The snippet has nothing drawn around it, so that it
 * copies out of the terminal as it is.
 */
export const embed = (form: FormDetail): void => {
  for (const line of highlight(snippet(form)).split('\n')) {
    console.log(`  ${line}`);
  }
  console.log('');
  v1.rows([['Code examples', chalk.cyan(examplesUrl(form))]]);
};

/** What the options that describe a form's contents parse to. */
export interface FormContentArgs {
  name?: string | undefined;
  formKey?: string | undefined;
  email?: string[] | undefined;
  webhook?: string | undefined;
  app?: string[] | undefined;
  redirect?: string | undefined;
  recaptcha?: boolean | undefined;
  from?: string | undefined;
  stdin?: boolean | undefined;
}

/** The options that describe a form, shared by create and update. */
export const bodyOptions = <T>(yargs: Argv<T>) =>
  yargs
    .option('form-key', {
      type: 'string',
      describe: "The form's key, for /p/<project_id>/f/<key>",
    })
    .option('email', {
      type: 'string',
      array: true,
      describe: 'Email submissions to this address. Repeat for several',
    })
    .option('webhook', {
      type: 'string',
      describe: 'POST submissions to this URL',
    })
    .option('app', {
      type: 'string',
      array: true,
      describe:
        'Send submissions to this app, connected later in the dashboard. Repeat for several',
    })
    .option('redirect', {
      type: 'string',
      describe: 'Where to send people after they submit',
    })
    .option('recaptcha', {
      type: 'boolean',
      describe: 'Turn reCAPTCHA on, or off with --no-recaptcha',
    })
    .option('from', {
      type: 'string',
      describe:
        'A JSON file with the form as in formspree.json (name, key, fields, captcha, actions), plus redirect. Flags win',
    })
    .option('stdin', {
      type: 'boolean',
      describe: 'Read that JSON from stdin instead of a file',
    })
    .conflicts('from', 'stdin');

/** What makes two actions the same kind: the API takes one of each. */
const kindOf = (item: ActionInput): string =>
  'app' in item ? `app:${item.app}` : item.type;

/**
 * The request body for a create or update: the --from or --stdin JSON,
 * with each flag set over it. A flag's action replaces the JSON's action
 * of the same type or app, since the API takes one of each.
 */
export const body = (args: FormContentArgs): FormBody => {
  // Whatever the file holds is sent as it is: the API says what's wrong.
  const data = v1.input(args) as FormBody;
  const actions: ActionInput[] = [];

  if (args.name !== undefined) data.name = args.name;
  if (args.formKey !== undefined) data.key = args.formKey;
  if (args.redirect !== undefined) data.redirect = args.redirect;
  if (args.recaptcha !== undefined) {
    data.captcha = args.recaptcha ? { type: 'recaptcha' } : null;
  }

  if (args.email?.length) actions.push({ type: 'email', to: args.email });
  if (args.webhook !== undefined) {
    actions.push({ type: 'webhook', url: args.webhook });
  }
  for (const app of args.app ?? []) actions.push({ app });

  if (actions.length) {
    const named = new Set(actions.map(kindOf));
    const kept = (Array.isArray(data.actions) ? data.actions : []).filter(
      (item) => !named.has(kindOf(item)),
    );
    data.actions = [...kept, ...actions];
  }

  return data;
};

const split = (answer: string): string[] =>
  answer.split(/[\s,]+/).filter(Boolean);

// The apps the API takes as an { app } action, for the question to list:
// the id the API and --app know each by, and the name people know it by.
// They mirror the server's list, so an app added there is missing here
// until this is updated; --app still takes it.
const APPS: Readonly<Record<string, string>> = {
  activecampaign: 'ActiveCampaign',
  airtable: 'Airtable',
  asana: 'Asana',
  constantcontact: 'Constant Contact',
  convertkit: 'ConvertKit',
  discord: 'Discord',
  freshdesk: 'Freshdesk',
  github: 'GitHub',
  gladly: 'Gladly',
  googlesheets: 'Google Sheets',
  gorgias: 'Gorgias',
  hubspot: 'HubSpot',
  klaviyo: 'Klaviyo',
  linear: 'Linear',
  mailchimp: 'Mailchimp',
  mailerlite: 'MailerLite',
  notion: 'Notion',
  pipedrive: 'Pipedrive',
  salesforce: 'Salesforce',
  slack: 'Slack',
  stripe: 'Stripe',
  telegram: 'Telegram',
  trello: 'Trello',
  zapier: 'Zapier',
  zendesk: 'Zendesk',
};

const DEFAULT_PROJECT_NAME = 'Default Project';

/** Where a form can go, as the project question resolves. */
type ProjectChoice =
  { kind: 'existing'; id: string } | { kind: 'default' } | { kind: 'new' };

/**
 * Asks which project a form goes into: one of `choices`, the default
 * project, or a new one. The default project is the one the API uses when
 * none is named, made if it's missing, so it's only offered on its own
 * when it isn't among the choices.
 */
const pickProject = (
  p: Prompts,
  choices: readonly Project[],
): Promise<ProjectChoice> => {
  const options: Option<ProjectChoice>[] = choices.map((project) => ({
    value: { kind: 'existing', id: project.id },
    label: projects.title(project),
    hint: project.id,
  }));
  // The cursor starts on an option by identity, so it's given the very
  // value the list holds.
  let initialValue = options.find(
    (option) => option.label === DEFAULT_PROJECT_NAME,
  )?.value;

  if (!initialValue) {
    initialValue = { kind: 'default' };
    options.push({
      value: initialValue,
      label: DEFAULT_PROJECT_NAME,
      hint: 'made if missing',
    });
  }
  options.push({ value: { kind: 'new' }, label: 'New project…' });

  return p.select<ProjectChoice>({ message: 'Project', options, initialValue });
};

/** What a text prompt resolved with, or undefined when it was left empty. */
const entered = (value: string | undefined): string | undefined =>
  value?.trim() || undefined;

// Validation for the prompts: what the API would refuse is caught at the
// question, not after the whole form is filled in.
const emailsOrNothing = (value: string | undefined): string | undefined => {
  const valid = split(value ?? '').every((address) =>
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address),
  );
  return valid ? undefined : 'Enter email addresses, with commas between them';
};

const nameRequired = (value: string | undefined): string | undefined =>
  entered(value) ? undefined : 'Give it a name';

const urlOrNothing = (value: string | undefined): string | undefined => {
  const url = entered(value);
  if (!url || /^https?:\/\/\S+$/.test(url)) return undefined;
  return 'Enter a URL that starts with http:// or https://';
};

/**
 * Asks which of `choices` is meant, with `message` saying what for.
 * Resolves with the form.
 */
export const pick = (
  p: Prompts,
  message: string,
  choices: readonly FormSummary[],
): Promise<FormSummary> =>
  p.select<FormSummary>({
    message,
    options: choices.map((form) => ({
      value: form,
      label: title(form),
      hint: form.hashid,
    })),
    maxItems: 10,
  });

/** What `forms create` already knows before it asks anything. */
export interface KnownForm {
  name?: string | undefined;
  /** A project's id. */
  project?: string | undefined;
  projectName?: string | undefined;
  account?: string | undefined;
  accounts: readonly Account[];
  projects: readonly Project[];
}

/** What the questions add, under the options' names. */
export interface FormAnswers {
  name?: string;
  project?: string;
  projectName?: string | undefined;
  /** Set to undefined to drop an --account the picked project replaces. */
  account?: string | undefined;
  email?: string[];
  webhook?: string | undefined;
  app?: string[];
  redirect?: string | undefined;
  recaptcha?: boolean;
}

/**
 * Asks for what `forms create` takes as options, apart from the form key:
 * few forms need one, and --form-key is there for those. Everything can
 * be left as it is, except the account when there are several and the
 * form isn't going into a project that already exists.
 *
 * The name, project and account are asked for only when the command line
 * didn't give them.
 */
export const ask = async (
  p: Prompts,
  known: KnownForm,
): Promise<FormAnswers> => {
  const answers: FormAnswers = {};

  if (known.name === undefined) {
    answers.name = await p.text({
      message: 'Form name',
      placeholder: 'New Form',
      defaultValue: 'New Form',
    });
  }

  // With --account, only that account's projects are a choice.
  const choices =
    known.account === undefined
      ? known.projects
      : known.projects.filter(
          (project) => project.account_id === known.account,
        );

  if (known.project !== undefined || known.projectName !== undefined) {
    // The command line already said where the form goes.
  } else if (choices.length) {
    const picked = await pickProject(p, choices);

    if (picked.kind === 'new') {
      answers.projectName = entered(
        await p.text({
          message: 'Project name',
          validate: nameRequired,
        }),
      );
    } else if (picked.kind === 'existing') {
      answers.project = picked.id;
      // The API takes a project or an account, and the project has one.
      if (known.account !== undefined) answers.account = undefined;
    }
  } else {
    // No defaultValue: naming the default project needs more access than
    // leaving it to the API.
    answers.projectName = entered(
      await p.text({
        message: 'Project name',
        placeholder: DEFAULT_PROJECT_NAME,
      }),
    );
  }

  // An existing project already has an account; anything else needs one.
  const intoExisting =
    known.project !== undefined || answers.project !== undefined;
  if (
    known.accounts.length > 1 &&
    !intoExisting &&
    known.account === undefined
  ) {
    answers.account = await accounts.pick(p, known.accounts);
  }

  const emails = entered(
    await p.text({
      message: 'Email submissions to (optional)',
      placeholder: 'you@example.com, team@example.com',
      validate: emailsOrNothing,
    }),
  );
  if (emails) answers.email = split(emails);

  answers.webhook = entered(
    await p.text({
      message: 'Webhook URL (optional)',
      placeholder: 'https://example.com/hook',
      validate: urlOrNothing,
    }),
  );

  const apps = await p.multiselect<string>({
    message: 'Apps to connect (optional)',
    options: Object.entries(APPS).map(([app, label]) => ({
      value: app,
      label,
      // What --app takes for it.
      hint: app,
    })),
    required: false,
    maxItems: 10,
  });
  if (apps.length) answers.app = apps;

  answers.redirect = entered(
    await p.text({
      message: 'Redirect after submitting (optional)',
      placeholder: 'https://example.com/thanks',
      validate: urlOrNothing,
    }),
  );

  // Off is where a new form starts, so that's where the question does.
  answers.recaptcha = await p.select<boolean>({
    message: 'reCAPTCHA',
    options: [
      { value: true, label: 'On' },
      { value: false, label: 'Off' },
    ],
    initialValue: false,
  });

  return answers;
};
