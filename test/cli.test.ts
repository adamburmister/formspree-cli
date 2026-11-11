import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGENT_VARIABLES } from '../src/agent.ts';
import { bannerAt } from './helpers/banner.ts';
import { plain } from './helpers/oauth.ts';

// The CLI as it's run in development: Node strips the types itself.
const CLI = path.join(import.meta.dirname, '..', 'src', 'cli.ts');

/**
 * The environment for a real run: an empty directory, so no .env is
 * loaded, with no Formspree env variables left over from the shell, and
 * none of the variables an AI agent sets, which these tests may well be
 * run under. The output is dressed as in a terminal, as FORCE_COLOR asks
 * (see vitest.config.ts), unless `extra` turns that off.
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
    ...AGENT_VARIABLES,
  ]) {
    if (!(name in extra)) delete env[name];
  }
  return { cwd, env };
};

/** What turns the terminal's look off, as when output is piped. */
const PIPED = { FORCE_COLOR: '0' };

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

it.each([
  ['help', ['help']],
  ['-h', ['-h']],
  ["a command's --help", ['forms', 'create', '--help']],
  ["a command's -h", ['forms', '-h']],
  ["a command's help", ['projects', 'help']],
])(
  'shows the banner at the top of the help asked for with %s',
  (_case, args) => {
    const help = cli(args);

    expect(help[0]).toBe('');
    expect(bannerAt(help)).toBe(1);
    expect(help.join('\n')).toContain('Options:');
  },
);

it('shows the banner over the help a bare `formspree` gets', () => {
  // The helper adds --skip-version-check: an option, but no command.
  const bare = cli([]);

  expect(bannerAt(bare)).toBe(1);
  expect(bare.join('\n')).toContain('formspree login');
});

it.each(['forms', 'projects'])(
  'shows the banner over the help `formspree %s` gets on its own',
  (group) => {
    const help = cli([group]);

    expect(bannerAt(help)).toBe(1);
    expect(help.join('\n')).toContain(`formspree ${group} list`);
  },
);

it.each([
  ['a mistyped command', ['logn'], 'Unknown command. Did you mean login?'],
  [
    "a group's mistyped command",
    ['forms', 'lst'],
    'Unknown command. Did you mean list?',
  ],
  [
    'a mistyped option',
    ['forms', 'create', 'Contact', '--emial', 'you@example.com'],
    'Unknown argument: emial. Did you mean --email?',
  ],
  [
    'two mistyped options',
    ['forms', 'create', '--emial', 'a@b.c', '--webhok', 'https://x.example'],
    'Unknown arguments: emial, webhok. Did you mean --email or --webhook?',
  ],
  [
    'an option that is nothing like one it takes',
    ['whoami', '--bogus'],
    'Unknown argument: bogus',
  ],
  [
    'a missing argument',
    ['forms', 'get'],
    'Missing an argument: formspree forms get <form>',
  ],
])(
  'says what is wrong with %s in a few lines, not the whole help',
  (_case, args, said) => {
    const shown = cli(args).filter((line) => line.trim());

    // The error first, then the usage and where to look: nothing more.
    expect(shown[0]).toBe(`✕ ${said}`);
    expect(shown.length).toBeLessThanOrEqual(3);
    expect(shown.at(-1)).toMatch(
      /^ {2}Run formspree .*--help to see what it takes\.$/,
    );
    expect(shown.join('\n')).not.toContain('Options:');
    expect(bannerAt(cli(args))).toBe(-1);
  },
);

it('points at the help of the command that was being run', () => {
  const shown = cli(['forms', 'create', '--emial', 'x']);

  expect(shown).toContain('  Usage: formspree forms create [name]');
  expect(shown).toContain(
    '  Run formspree forms create --help to see what it takes.',
  );
});

it.each([
  [['--help'], 'formspree forms create "Contact" --email you@example.com'],
  [['forms', '--help'], 'formspree forms list --json'],
  [['forms', 'create', '--help'], 'formspree forms create --from contact.json'],
  [['projects', 'delete', '--help'], '--yes --forms'],
  [['login', '--help'], 'formspree login --complete'],
  [['open', '--help'], 'formspree open docs'],
  [['deploy', '--help'], 'formspree deploy -k <deploy-key>'],
])('gives examples in the help for %j', (args, example) => {
  const help = cli(args).join('\n');

  expect(help).toContain('Examples:');
  expect(help).toContain(example);
});

it('keeps each example on one line when the help is piped', () => {
  const { stdout } = result(['forms', 'create', '--help'], PIPED);

  // Unwrapped, so the command can be read or copied whole.
  expect(stdout).toMatch(
    /^ {2}formspree forms create "Contact" --project proj_2pn3r0jq7zz0t --app slack --json {2,}In one project, printing the new form as JSON$/m,
  );
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

/** Runs the real CLI. Returns its exit code and both streams, apart. */
const result = (args: string[], extra: NodeJS.ProcessEnv = {}) => {
  const { cwd, env } = sandbox(extra);
  const run = spawnSync(
    process.execPath,
    [CLI, ...args, '--skip-version-check'],
    { cwd, env, encoding: 'utf8' },
  );
  return { code: run.status, stdout: run.stdout, stderr: plain(run.stderr) };
};

describe('piped somewhere, with no terminal to dress the output for', () => {
  it('prints help without the banner', () => {
    const { stdout } = result(['--help'], PIPED);

    expect(stdout.startsWith('formspree <command>')).toBe(true);
    expect(bannerAt(stdout.split('\n'))).toBe(-1);
  });

  it('prints no banner over the help a bare `formspree` gets', () => {
    const { stderr } = result([], PIPED);

    expect(bannerAt(stderr.split('\n'))).toBe(-1);
    expect(stderr).toContain('formspree login');
  });

  it('prints no version line, only what the command has to say', () => {
    const { stdout, stderr } = result(['whoami'], PIPED);

    expect(stdout).toBe('');
    expect(stderr).not.toContain('Formspree CLI v');
    expect(stderr).toContain('Not logged in');
  });

  it('logs in without the banner', () => {
    const { stdout } = result(['login'], PIPED);

    expect(bannerAt(stdout.split('\n'))).toBe(-1);
  });
});

describe('run by an AI agent', () => {
  it.each([
    ['AI_AGENT', 'claude-code_2-1_agent'],
    ['CLAUDECODE', '1'],
    ['CURSOR_AGENT', '1'],
    ['GEMINI_CLI', '1'],
  ])('prints JSON without being asked, with %s set', (name, value) => {
    const { code, stdout, stderr } = result(['forms', 'list'], {
      ...PIPED,
      [name]: value,
    });

    expect(JSON.parse(stdout).error.code).toBe('NOT_LOGGED_IN');
    expect(stderr).toBe('');
    expect(code).toBe(4);
  });

  it('reports a command line it cannot use as JSON, without the help', () => {
    const { code, stdout, stderr } = result(['forms', 'lst'], {
      ...PIPED,
      AI_AGENT: 'test',
    });

    expect(JSON.parse(stdout).error).toEqual({
      code: 'INVALID_USAGE',
      message: 'Unknown command. Did you mean list?',
    });
    expect(stderr).toBe('');
    expect(code).toBe(2);
  });

  it('prints text again with --no-json', () => {
    const { code, stdout, stderr } = result(['forms', 'list', '--no-json'], {
      ...PIPED,
      AI_AGENT: 'test',
    });

    expect(stdout).toBe('');
    expect(stderr).toContain('Not logged in');
    expect(code).toBe(4);
  });

  it.each(['0', 'false', ''])('is not what AI_AGENT=%j says', (value) => {
    const { stdout, stderr } = result(['forms', 'list'], {
      ...PIPED,
      AI_AGENT: value,
    });

    expect(stdout).toBe('');
    expect(stderr).toContain('Not logged in');
  });
});

it('exits with 2 for a command line it cannot use', () => {
  const { code, stdout, stderr } = result(['whoami', '--bogus']);

  expect(code).toBe(2);
  expect(stdout).toBe('');
  expect(stderr).toContain('Unknown argument: bogus');
});

it('says a command is unknown, with its suggestion', () => {
  const { code, stderr } = result(['logn']);

  expect(code).toBe(2);
  expect(stderr.trimStart().split('\n')[0]).toBe(
    '✕ Unknown command. Did you mean login?',
  );
});

it('reports a command line it cannot use as JSON with --json', () => {
  const { code, stdout, stderr } = result([
    'forms',
    'list',
    '--bogus',
    '--json',
  ]);

  expect(JSON.parse(stdout)).toEqual({
    ok: false,
    error: { code: 'INVALID_USAGE', message: 'Unknown argument: bogus' },
    detail: 'Unknown argument: bogus',
    retryable: false,
    next_steps: [
      {
        step: 'see_help',
        detail: 'See what the command takes, with examples.',
        command: 'formspree forms list --help',
      },
    ],
  });
  // No help text for a script to wade through.
  expect(stderr).toBe('');
  expect(code).toBe(2);
});

it('exits with 4, as JSON with --json, when there is no login', () => {
  const { code, stdout } = result(['forms', 'list', '--json']);

  expect(JSON.parse(stdout).error.code).toBe('NOT_LOGGED_IN');
  expect(code).toBe(4);
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
  const cliWithServer = (
    args: string[],
    stdin = '',
    extra: NodeJS.ProcessEnv = {},
  ) => {
    const { port } = server.address() as AddressInfo;
    const { cwd, env } = sandbox({
      FORMSPREE_API_URL: `http://127.0.0.1:${port}`,
      FORMSPREE_API_KEY: 'fsk_test',
      ...extra,
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

  it('prints nothing but the link on stdout with open --url', async () => {
    const { code, stdout, stderr } = await cliWithServer(['open', '--url']);
    const { port } = server.address() as AddressInfo;

    expect(stdout).toBe(`http://127.0.0.1:${port}/forms\n`);
    expect(stderr).toBe('');
    expect(received).toEqual([]);
    expect(code).toBe(0);
  });

  it('prints the link, without opening it, when the output is piped', async () => {
    const { code, stdout } = await cliWithServer(['open']);
    const { port } = server.address() as AddressInfo;

    expect(stdout.trimEnd().split('\n').at(-1)).toBe(
      `http://127.0.0.1:${port}/forms`,
    );
    expect(code).toBe(0);
  });

  it('prints a create as plain text when piped, with nothing drawn', async () => {
    const { code, stdout, stderr } = await cliWithServer(
      ['projects', 'create', 'Site'],
      '',
      PIPED,
    );

    expect(stdout.split('\n')[0]).toBe('✔ Project created: Site (proj_x)');
    // No frame, no banner, no version line.
    expect(stdout).not.toMatch(/[│╭╮╰╯◇]/);
    expect(stdout).not.toContain('Formspree CLI v');
    // The note about the server is kept, out of the way on stderr.
    expect(stderr).toContain('FORMSPREE_API_URL');
    expect(code).toBe(0);
  });

  it("prints the API's response as JSON for an agent, without --json", async () => {
    const { code, stdout } = await cliWithServer(
      ['projects', 'get', 'proj_x'],
      '',
      { ...PIPED, AI_AGENT: 'test' },
    );

    expect(JSON.parse(stdout)).toEqual({
      project: { id: 'proj_x', name: 'Site' },
    });
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
