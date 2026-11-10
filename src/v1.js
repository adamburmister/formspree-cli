const fs = require('fs');
const chalk = require('chalk');
const log = require('./log');
const messages = require('./messages');
const oauth = require('./oauth');
const api = require('./api');

/**
 * Thrown for input the CLI can't use, before anything is sent.
 */
class UsageError extends Error {}

/**
 * The options every command that calls /api/v1 takes.
 */
const options = yargs => {
  return yargs
    .option('key', {
      alias: 'k',
      type: 'string',
      describe:
        'API key to use instead of your login (or set FORMSPREE_API_KEY)'
    })
    .option('json', {
      type: 'boolean',
      describe: 'Print the API response as JSON'
    });
};

/**
 * The option for the creates that honor an Idempotency-Key.
 */
const idempotencyOption = yargs => {
  return yargs.option('idempotency-key', {
    type: 'string',
    describe:
      'Makes a retry safe: the same key within 24 hours returns the first result instead of creating again'
  });
};

const idempotencyHeaders = args => {
  return args.idempotencyKey
    ? { 'Idempotency-Key': args.idempotencyKey }
    : undefined;
};

/**
 * Whether the response repeats an earlier request with the same
 * Idempotency-Key, so nothing new was created.
 */
const replayed = response => {
  return (
    String((response.headers || {})['idempotent-replayed']).toLowerCase() ===
    'true'
  );
};

const isObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Writes an indented line to stderr.
 */
const detail = line => console.error(`  ${line}`);

/**
 * Prints the steps a response says are left. `rewrite` maps a step's name
 * to a line that replaces the server's, which is written for API callers.
 * With `linkedOnly`, steps without a link are left out.
 */
const nextSteps = (steps, { rewrite = {}, linkedOnly, print } = {}) => {
  const out = print || console.log;
  const shown = (steps || []).filter(step => !linkedOnly || step.url);
  if (!shown.length) return;

  out('  Next steps:');
  shown.forEach(step => {
    const replacement = rewrite[step.step];
    if (replacement) {
      out(`  - ${replacement}`);
      return;
    }
    out(`  - ${step.detail}`);
    if (step.url) out(`    ${chalk.cyan(step.url)}`);
  });
  out('');
};

/**
 * Says why the API refused a request. v1 answers with an RFC 9457 problem;
 * a few older errors are still { ok: false, error }.
 */
const reportProblem = response => {
  const body = isObject(response.data) ? response.data : {};
  const legacy = isObject(body.error) ? body.error.message : body.error;
  const reason = body.detail || legacy || 'Request failed';
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const accounts = Array.isArray(body.accounts) ? body.accounts : [];

  log.error(`${reason} ${chalk.gray(`(${response.status})`)}`);
  if (!errors.length && !accounts.length && !body.next_steps) return;
  console.error('');

  errors.forEach(error => {
    const allowed = Array.isArray(error.allowed)
      ? chalk.gray(` (allowed: ${error.allowed.join(', ')})`)
      : '';
    const path = error.path ? `${log.variable(error.path)}: ` : '';
    detail(`${path}${error.message}${allowed}`);
  });
  if (errors.length) console.error('');

  if (accounts.length) {
    accounts.forEach(account => {
      detail(
        `${account.name || 'Personal account'} ${chalk.gray(`(${account.id})`)}`
      );
    });
    console.error('');
    detail(`Pick one with ${log.variable('--account <id>')}`);
    console.error('');
  }

  nextSteps(body.next_steps, { linkedOnly: true, print: console.error });
};

const reportFailure = (error, endpoint) => {
  if (error instanceof api.LoginRequired) {
    messages.loginRequired(error.message);
  } else if (error instanceof api.InvalidKey) {
    log.error(error.message);
    detail(
      `Check the ${log.variable('--key')} flag or the ${log.variable(
        'FORMSPREE_API_KEY'
      )} env variable.`
    );
  } else {
    log.error(
      `Request failed unexpectedly ${chalk.gray(
        `(${error.code || error.message} from ${endpoint})`
      )}`
    );
  }
};

/**
 * Sends a v1 request with the API key or stored login, or with no
 * credential when `anonymous`. Resolves with the response when it's a 2xx.
 * Anything else is reported, the exit code is set, and it resolves with
 * null.
 *
 * With --json a refusal's body goes to stdout as it came, so a script gets
 * the problem's `errors` and `next_steps`.
 *
 * @param {object} args
 * @param {{ method: string, path: string, params?: object, data?: object, headers?: object }} req
 * @param {{ anonymous?: boolean }} [opts]
 */
const call = async (args, req, { anonymous } = {}) => {
  const endpoint = oauth.endpoint();
  let response;

  messages.usingEndpoint(endpoint, { stderr: args.json });

  try {
    response = anonymous
      ? await api.anonymous(endpoint, req)
      : await api.request(endpoint, req, { key: api.apiKey(args.key) });
  } catch (error) {
    reportFailure(error, endpoint);
    process.exitCode = 1;
    return null;
  }

  if (response.status >= 200 && response.status < 300) return response;

  process.exitCode = 1;
  if (args.json && isObject(response.data)) {
    console.log(JSON.stringify(response.data, null, 2));
  } else {
    reportProblem(response);
  }
  return null;
};

/**
 * Prints a successful response: as JSON with --json, else with `render`.
 */
const print = (args, response, render) => {
  if (args.json) {
    console.log(JSON.stringify(response.data, null, 2));
  } else {
    render(response.data);
  }
};

/**
 * Runs a command's handler, reporting input the CLI can't use.
 */
const run = handler => async args => {
  try {
    await handler(args);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    log.error(error.message);
    process.exitCode = 1;
  }
};

/**
 * Reads a JSON object from a file, or from stdin when there's no path.
 *
 * @param {string} [file]
 */
const readJson = file => {
  const name = file || 'The input';
  let text;
  try {
    text = fs.readFileSync(file || 0, 'utf8');
  } catch (error) {
    throw new UsageError(`${name} could not be read`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new UsageError(`${name} is not valid JSON`);
  }
  if (!isObject(parsed)) {
    throw new UsageError(`${name} must hold a JSON object`);
  }
  return parsed;
};

/**
 * The JSON object a command was given with --from or --stdin, else an
 * empty one.
 */
const input = args => {
  if (args.stdin) return readJson();
  return args.from ? readJson(args.from) : {};
};

/**
 * Prints label and value pairs in two columns, skipping empty values. A
 * value can be an array of lines.
 *
 * @param {Array<[string, (string|string[]|null|undefined)]>} pairs
 */
const rows = pairs => {
  const shown = pairs
    .map(([label, value]) => [label, [].concat(value == null ? [] : value)])
    .filter(([, lines]) => lines.length);
  const width = Math.max.apply(
    null,
    shown.map(([label]) => label.length)
  );

  shown.forEach(([label, lines]) => {
    lines.forEach((line, i) => {
      const head = (i === 0 ? label : '').padEnd(width);
      console.log(`  ${chalk.gray(head)}  ${line}`);
    });
  });
  if (shown.length) console.log('');
};

/**
 * A path segment for an id the user typed.
 */
const segment = id => encodeURIComponent(String(id));

module.exports = {
  UsageError,
  options,
  idempotencyOption,
  idempotencyHeaders,
  replayed,
  call,
  print,
  run,
  input,
  rows,
  nextSteps,
  segment
};
