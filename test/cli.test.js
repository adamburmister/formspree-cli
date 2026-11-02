const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { bannerAt } = require('./helpers/banner');

const BIN = path.join(__dirname, '..', 'bin', 'formspree');

// Runs the real CLI in an empty directory, so no .env is loaded, with no
// Formspree env variables and no network version check.
const run = args => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'formspree-cli-'));
  const env = Object.assign({}, process.env, {
    FORMSPREE_CONFIG_DIR: cwd
  });
  delete env.FORMSPREE_API_URL;
  delete env.FORMSPREE_CLIENT_ID;
  delete env.FORMSPREE_API_KEY;

  const result = spawnSync(
    process.execPath,
    [BIN].concat(args, '--skip-version-check'),
    { cwd, env, encoding: 'utf8' }
  );
  return (result.stdout + result.stderr)
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n');
};

it('shows the banner at the top of --help, after a blank line', () => {
  const help = run(['--help']);

  expect(help[0]).toBe('');
  expect(bannerAt(help)).toBe(1);
  expect(help.join('\n')).toContain('formspree login');
});

it('shows the banner before anything else when logging in', () => {
  const login = run(['login']);
  const preamble = login.findIndex(line => line.includes('Formspree CLI v'));

  expect(login[0]).toBe('');
  expect(bannerAt(login)).toBe(1);
  expect(preamble).toBeGreaterThan(1);
});

it('leaves other commands without the banner', () => {
  const whoami = run(['whoami']);

  expect(bannerAt(whoami)).toBe(-1);
  expect(whoami.join('\n')).toContain('Formspree CLI v');
});
