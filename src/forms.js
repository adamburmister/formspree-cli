const chalk = require('chalk');
const v1 = require('./v1');

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

module.exports = { line, show, bodyOptions, body };
