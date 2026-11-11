import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bannerAt } from './helpers/banner.ts';
import { plain } from './helpers/oauth.ts';

// The CLI as it's run in development: Node strips the types itself.
const CLI = path.join(import.meta.dirname, '..', 'src', 'cli.ts');

/**
 * The environment for a real run: an empty directory, so no .env is
 * loaded, with no Formspree env variables left over from the shell.
 */
const sandbox = (extra: NodeJS.ProcessEnv = {}) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'formspree-cli-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FORMSPREE_CONFIG_DIR: cwd,
    ...extra,
  };
  for (const name of [
    'FORMSPREE_API_URL',
    'FORMSPREE_CLIENT_ID',
    'FORMSPREE_API_KEY',
  ]) {
    if (!(name in extra)) delete env[name];
  }
  return { cwd, env };
};

/** Runs the real CLI, with no network version check. Returns its lines. */
const cli = (args: string[]): string[] => {
  const { cwd, env } = sandbox();
  const result = spawnSync(
    process.execPath,
    [CLI, ...args, '--skip-version-check'],
    { cwd, env, encoding: 'utf8' },
  );
  return plain(result.stdout + result.stderr).split('\n');
};

it('shows the banner at the top of --help, after a blank line', () => {
  const help = cli(['--help']);

  expect(help[0]).toBe('');
  expect(bannerAt(help)).toBe(1);
  expect(help.join('\n')).toContain('formspree login');
});

it('shows the banner before anything else when logging in', () => {
  const login = cli(['login']);
  const preamble = login.findIndex((line) => line.includes('Formspree CLI v'));

  expect(login[0]).toBe('');
  expect(bannerAt(login)).toBe(1);
  expect(preamble).toBeGreaterThan(1);
});

it('leaves other commands without the banner', () => {
  const whoami = cli(['whoami']);

  expect(bannerAt(whoami)).toBe(-1);
  expect(whoami.join('\n')).toContain('Formspree CLI v');
});

it('refuses an option it does not know, rather than dropping it', () => {
  const create = cli([
    'forms',
    'create',
    'Contact',
    '--emial',
    'you@example.com',
  ]);

  expect(create.join('\n')).toContain('Unknown argument: emial');
  expect(create.join('\n')).not.toContain('Form created');
});

it('suggests the command that was meant', () => {
  const typo = cli(['forms', 'creat']);

  expect(typo.join('\n')).toContain('Did you mean create?');
});

it('calls itself formspree, whatever file it is run from', () => {
  const help = cli(['--help']).join('\n');

  expect(help).toContain('formspree <command>');
  expect(help).not.toContain('cli.ts');
});

describe('against a local server', () => {
  let server: http.Server;
  let received: { method?: string; url?: string; body: string }[];

  // Runs the real CLI without blocking, so the server here can answer it.
  const cliWithServer = (args: string[], stdin = '') => {
    const { port } = server.address() as AddressInfo;
    const { cwd, env } = sandbox({
      FORMSPREE_API_URL: `http://127.0.0.1:${port}`,
      FORMSPREE_API_KEY: 'fsk_test',
    });

    return new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (resolve) => {
        const child = spawn(
          process.execPath,
          [CLI, ...args, '--skip-version-check'],
          { cwd, env },
        );
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.stderr.on('data', (chunk) => (stderr += chunk));
        child.on('close', (code) => resolve({ code, stdout, stderr }));
        child.stdin.end(stdin);
      },
    );
  };

  beforeEach(async () => {
    received = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ project: { id: 'proj_x', name: 'Site' } }));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('keeps a long numeric id as it was typed', async () => {
    const { code } = await cliWithServer([
      'projects',
      'get',
      '3122252403177421850',
    ]);

    expect(received.map((r) => r.url)).toEqual([
      '/api/v1/projects/3122252403177421850',
    ]);
    expect(code).toBe(0);
  });

  it('prints nothing but the response on stdout with --json', async () => {
    const { code, stdout, stderr } = await cliWithServer([
      'projects',
      'get',
      'proj_x',
      '--json',
    ]);

    expect(JSON.parse(stdout)).toEqual({
      project: { id: 'proj_x', name: 'Site' },
    });
    expect(stderr).toContain('FORMSPREE_API_URL');
    expect(code).toBe(0);
  });

  it('reads a form from stdin with --stdin, leaving flags unset', async () => {
    await cliWithServer(
      ['forms', 'update', 'xyzabcde', '--stdin'],
      JSON.stringify({ fields: { email: { type: 'email' } } }),
    );

    expect(received).toEqual([
      {
        method: 'PATCH',
        url: '/api/v1/forms/xyzabcde',
        body: JSON.stringify({ fields: { email: { type: 'email' } } }),
      },
    ]);
  });

  it('takes a repeated option one value at a time, leaving the name alone', async () => {
    await cliWithServer([
      'forms',
      'create',
      '--no-interactive',
      '--email',
      'a@example.com',
      '--email',
      'b@example.com',
      'Contact',
    ]);

    expect(received.map((r) => JSON.parse(r.body))).toEqual([
      {
        name: 'Contact',
        actions: [{ type: 'email', to: ['a@example.com', 'b@example.com'] }],
      },
    ]);
  });
});
