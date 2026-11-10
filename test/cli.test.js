const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
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

describe('against a local server', () => {
  let server;
  let received;

  // Runs the real CLI without blocking, so the server here can answer it.
  const runWithServer = (args, stdin) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'formspree-cli-'));
    const env = Object.assign({}, process.env, {
      FORMSPREE_CONFIG_DIR: cwd,
      FORMSPREE_API_URL: `http://127.0.0.1:${server.address().port}`,
      FORMSPREE_API_KEY: 'fsk_test'
    });
    delete env.FORMSPREE_CLIENT_ID;

    return new Promise(resolve => {
      const child = spawn(
        process.execPath,
        [BIN].concat(args, '--skip-version-check'),
        { cwd, env }
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => (stdout += chunk));
      child.stderr.on('data', chunk => (stderr += chunk));
      child.on('close', code => resolve({ code, stdout, stderr }));
      child.stdin.end(stdin || '');
    });
  };

  beforeEach(done => {
    received = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ project: { id: 'proj_x', name: 'Site' } }));
      });
    });
    server.listen(0, '127.0.0.1', done);
  });

  afterEach(done => server.close(done));

  it('keeps a long numeric id as it was typed', async () => {
    const { code } = await runWithServer([
      'projects',
      'get',
      '3122252403177421850'
    ]);

    expect(received.map(r => r.url)).toEqual([
      '/api/v1/projects/3122252403177421850'
    ]);
    expect(code).toBe(0);
  });

  it('prints nothing but the response on stdout with --json', async () => {
    const { code, stdout, stderr } = await runWithServer([
      'projects',
      'get',
      'proj_x',
      '--json'
    ]);

    expect(JSON.parse(stdout)).toEqual({
      project: { id: 'proj_x', name: 'Site' }
    });
    expect(stderr).toContain('FORMSPREE_API_URL');
    expect(code).toBe(0);
  });

  it('reads a form from stdin with --stdin, leaving flags unset', async () => {
    await runWithServer(
      ['forms', 'update', 'xyzabcde', '--stdin'],
      JSON.stringify({ fields: { email: { type: 'email' } } })
    );

    expect(received).toEqual([
      {
        method: 'PATCH',
        url: '/api/v1/forms/xyzabcde',
        body: JSON.stringify({ fields: { email: { type: 'email' } } })
      }
    ]);
  });
});
