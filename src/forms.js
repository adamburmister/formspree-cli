const chalk = require('chalk');
const v1 = require('./v1');
const prompt = require('./prompt');
const accounts = require('./accounts');
const projects = require('./projects');

/**
 * A form on one line, as the lists show it.
 */
const line = form => {
  return `${form.name || 'Untitled form'} ${chalk.gray(`(${form.hashid})`)}`;
};

const status = value => {
  const text = String(value).replace(/_/g, ' ');
  return value === 'active' ? chalk.green(text) : chalk.yellow(text);
};

const action = item => {
  const name = item.app || item.type;
  const to = item.to && item.to.length ? ` to ${item.to.join(', ')}` : '';
  return `${name}${to} ${chalk.gray('·')} ${status(item.status)}`;
};

const rule = (name, rules) => {
  const parts = Object.keys(rules || {}).map(key => {
    const value = rules[key];
    if (value === true) return key;
    return `${key} ${Array.isArray(value) ? value.join(' ') : value}`;
  });
  return parts.length ? `${name} ${chalk.gray(parts.join(', '))}` : name;
};

/**
 * Prints one form's details.
 */
const show = form => {
  const links = form.links || {};
  const fields = form.fields || {};

  v1.rows([
    ['Submit to', chalk.cyan(form.submission_url || form.url)],
    ['Project', form.project_id],
    ['Key', form.key],
    ['Fields', Object.keys(fields).map(name => rule(name, fields[name]))],
    [
      'reCAPTCHA',
      form.captcha === undefined ? null : form.captcha ? 'on' : 'off'
    ],
    ['Actions', (form.actions || []).map(action)],
    ['Dashboard', links.dashboard && chalk.cyan(links.dashboard)]
  ]);
};

/**
 * The options that describe a form, shared by create and update.
 */
const bodyOptions = yargs => {
  return yargs
    .option('form-key', {
      type: 'string',
      describe: "The form's key, for /p/<project_id>/f/<key>"
    })
    .option('email', {
      type: 'string',
      describe: 'Email submissions to this address. Repeat for several'
    })
    .option('webhook', {
      type: 'string',
      describe: 'POST submissions to this URL'
    })
    .option('app', {
      type: 'string',
      describe:
        'Send submissions to this app, connected later in the dashboard. Repeat for several'
    })
    .option('redirect', {
      type: 'string',
      describe: 'Where to send people after they submit'
    })
    .option('recaptcha', {
      type: 'boolean',
      describe: 'Turn reCAPTCHA on, or off with --no-recaptcha'
    })
    .option('from', {
      type: 'string',
      describe:
        'A JSON file with the form as in formspree.json (name, key, fields, captcha, actions), plus redirect. Flags win'
    })
    .option('stdin', {
      type: 'boolean',
      describe: 'Read that JSON from stdin instead of a file'
    })
    .conflicts('from', 'stdin');
};

const list = value => [].concat(value === undefined ? [] : value);

const kindOf = item =>
  (item && (item.app ? `app:${item.app}` : item.type)) || '';

/**
 * The request body for a create or update: the --from or --stdin JSON, with each flag
 * set over it. A flag's action replaces the JSON's action of the same type
 * or app, since the API takes one of each.
 */
const body = args => {
  const data = v1.input(args);
  const actions = [];

  if (args.name !== undefined) data.name = args.name;
  if (args.formKey !== undefined) data.key = args.formKey;
  if (args.redirect !== undefined) data.redirect = args.redirect;
  if (args.recaptcha !== undefined) {
    data.captcha = args.recaptcha ? { type: 'recaptcha' } : null;
  }

  const emails = list(args.email);
  if (emails.length) actions.push({ type: 'email', to: emails });
  if (args.webhook !== undefined) {
    actions.push({ type: 'webhook', url: args.webhook });
  }
  list(args.app).forEach(app => actions.push({ app }));

  if (actions.length) {
    const named = actions.map(kindOf);
    const kept = (Array.isArray(data.actions) ? data.actions : []).filter(
      item => !named.includes(kindOf(item))
    );
    data.actions = kept.concat(actions);
  }

  return data;
};

const split = answer => answer.split(/[\s,]+/).filter(Boolean);

/**
 * Asks for what `forms create` takes as options, apart from the form key:
 * few forms need one, and --form-key is there for those. Every question can be
 * skipped, except the account when there are several and the form isn't
 * going into a project that already exists. Resolves with the answers
 * under the options' names.
 *
 * @param {{ name?: string, accounts: object[], projects: object[] }} known
 */
const ask = ({ name, accounts: owners, projects: existing }) => {
  return prompt.session(async form => {
    const answers = {};

    form.say('');
    form.say(
      `  ${chalk.bold('New form.')} ${chalk.gray(
        'Press Enter to skip a question.'
      )}`
    );
    form.say('');

    if (name === undefined) {
      answers.name = await form.text('Name', { hint: 'default "New Form"' });
    }

    if (existing.length) {
      const project = await form.choose('Project', existing, {
        render: projects.line,
        hint:
          'Pick a number, type a new project\'s name, or press Enter for "Default Project"',
        allowText: true
      });
      if (project && project.item) answers.project = project.item.id;
      if (project && project.text) answers.projectName = project.text;
    } else {
      answers.projectName = await form.text('Project name', {
        hint: 'default "Default Project"'
      });
    }

    // An existing project already has an account; anything else needs one.
    if (owners.length > 1 && answers.project === undefined) {
      answers.account = await accounts.pick(form, owners);
    }

    const emails = await form.text('Email submissions to', {
      hint: 'optional, commas between several'
    });
    if (emails) answers.email = split(emails);

    answers.webhook = await form.text('Webhook URL', { hint: 'optional' });

    const apps = await form.text('Apps to connect', {
      hint: 'optional, like slack or mailchimp'
    });
    if (apps) answers.app = split(apps);

    answers.redirect = await form.text('Redirect after submitting', {
      hint: 'optional'
    });
    answers.recaptcha = await form.toggle('reCAPTCHA', {
      hint: 'on or off, optional'
    });

    form.say('');
    return answers;
  });
};

module.exports = { line, show, bodyOptions, body, ask };
