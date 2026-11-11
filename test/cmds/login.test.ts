import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useTempConfigDir,
  parseCall,
  oauthError,
  tokenResponse,
  deviceResponse,
  response,
  output,
  type Reply,
} from '../helpers/oauth.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as browser from '../../src/browser.ts';
import { sleep } from '../../src/util.ts';
import { command as cmd } from '../../src/cmds/login.ts';
import { run, post } from '../helpers/v1.ts';

vi.mock('axios');
vi.mock('../../src/browser.ts', () => ({
  available: vi.fn(() => false),
  open: vi.fn(),
}));
vi.mock('../../src/spinner.ts', () => ({
  start: vi.fn(() => ({ clear: vi.fn() })),
}));
vi.mock('../../src/util.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util.ts')>()),
  sleep: vi.fn(),
}));

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const args = {};

let credentialsFile: string;
let sleeps: number[];

// Routes mocked POSTs: /oauth/device answers with `device`, and each
// /oauth/tokens poll takes the next answer from `polls`.
const serve = ({
  device = deviceResponse(),
  polls,
}: {
  device?: Promise<Reply>;
  polls: (() => Promise<Reply>)[];
}) => {
  const queue = [...polls];
  post.mockImplementation((url) => {
    if (url.endsWith('/oauth/device')) return device;
    const poll = url.endsWith('/oauth/tokens') ? queue.shift() : undefined;
    if (poll) return poll();
    throw new Error(`Unexpected POST ${url}`);
  });
};

const tokenPolls = () =>
  post.mock.calls.map(parseCall).filter((c) => c.url.endsWith('/tokens'));

beforeEach(() => {
  credentialsFile = useTempConfigDir();
  sleeps = [];
  vi.mocked(sleep).mockImplementation((ms) => {
    sleeps.push(ms);
    return Promise.resolve();
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.FORMSPREE_CLIENT_ID = 'cli-client';
  // No browser to open, unless a test says there is one.
  vi.mocked(browser.available).mockReset().mockReturnValue(false);
  vi.mocked(browser.open).mockReset().mockResolvedValue(true);
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  post.mockReset();
  delete process.env.FORMSPREE_CLIENT_ID;
  delete process.env.FORMSPREE_API_URL;
  process.exitCode = undefined;
});

it('polls at the interval until approved and stores the tokens', async () => {
  serve({
    polls: [
      () => oauthError('authorization_pending'),
      () => oauthError('authorization_pending'),
      () => tokenResponse(),
    ],
  });

  await run(cmd, args);

  const [device] = post.mock.calls.map(parseCall);
  expect(device?.url).toBe('https://formspree.io/oauth/device');
  expect(device?.params).toEqual({
    client_id: 'cli-client',
    scope: 'projects:write project.forms:write submissions:write keys:write',
  });

  expect(tokenPolls()).toHaveLength(3);
  tokenPolls().forEach((poll) => {
    expect(poll.url).toBe('https://formspree.io/oauth/tokens');
    expect(poll.params).toEqual({
      grant_type: DEVICE_GRANT,
      device_code: 'the-device-code',
      client_id: 'cli-client',
    });
  });
  expect(sleeps).toEqual([5000, 5000, 5000]);

  expect(output(console.log)).toContain(
    'https://formspree.io/device?user_code=WDJB-MJHT',
  );
  expect(output(console.log)).toContain('WDJB-MJHT');
  expect(output(console.log)).toContain('Logged in');
  expect(process.exitCode).toBeUndefined();

  const stored = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  expect(stored['https://formspree.io']).toMatchObject({
    client_id: 'cli-client',
    access_token: 'fso_access_1',
    refresh_token: 'fso_refresh_1',
  });
  expect(fs.statSync(credentialsFile).mode & 0o777).toBe(0o600);
});

it('adds 5 seconds to the interval for every slow_down', async () => {
  serve({
    polls: [
      () => oauthError('authorization_pending'),
      () => oauthError('slow_down'),
      () => oauthError('authorization_pending'),
      () => oauthError('slow_down'),
      () => tokenResponse(),
    ],
  });

  await run(cmd, args);

  expect(sleeps).toEqual([5000, 5000, 10000, 10000, 15000]);
  expect(output(console.log)).toContain('Logged in');
});

it('stops with an error when the server says the code expired', async () => {
  serve({
    polls: [
      () => oauthError('authorization_pending'),
      () => oauthError('expired_token'),
    ],
  });

  await run(cmd, args);

  expect(output(console.error)).toContain('The login code expired');
  expect(output(console.log)).toContain('formspree login');
  expect(process.exitCode).toBe(1);
  expect(fs.existsSync(credentialsFile)).toBe(false);
});

it('stops polling once expires_in has passed', async () => {
  serve({
    device: deviceResponse({ expires_in: 12 }),
    polls: [
      () => oauthError('authorization_pending'),
      () => oauthError('authorization_pending'),
      () => tokenResponse(),
    ],
  });

  await run(cmd, args);

  expect(tokenPolls()).toHaveLength(2);
  expect(sleeps).toEqual([5000, 5000]);
  expect(output(console.error)).toContain('The login code expired');
  expect(process.exitCode).toBe(1);
  expect(fs.existsSync(credentialsFile)).toBe(false);
});

it('stops with an error when the login is denied', async () => {
  serve({ polls: [() => oauthError('access_denied')] });

  await run(cmd, args);

  expect(output(console.error)).toContain('Login was denied');
  expect(process.exitCode).toBe(1);
  expect(fs.existsSync(credentialsFile)).toBe(false);
});

it('asks to wait when starting logins too often', async () => {
  serve({ device: response(429, 'Too Many Requests'), polls: [] });

  await run(cmd, args);

  expect(tokenPolls()).toHaveLength(0);
  expect(output(console.error)).toContain('Too many login attempts');
  expect(process.exitCode).toBe(1);
});

// FORMSPREE_CLIENT_ID is for development only, so nothing a user sees
// should name it or show the id it holds.
const everything = () => `${output(console.log)}\n${output(console.error)}`;

const expectNoClientIdVariable = () => {
  expect(everything()).not.toContain('FORMSPREE_CLIENT_ID');
  expect(everything()).not.toContain('cli-client');
};

it('asks for an update when the server does not know the CLI', async () => {
  serve({ device: oauthError('invalid_client', 401), polls: [] });

  await run(cmd, args);

  expect(output(console.error)).toContain(
    "Formspree didn't recognize this version of the CLI",
  );
  expect(output(console.log)).toContain('Update to the latest version');
  expectNoClientIdVariable();
  expect(everything()).not.toMatch(/client.id/i);
  expect(process.exitCode).toBe(1);
});

describe('unexpected failures', () => {
  // Say what went wrong and which server said it, so a wrong
  // FORMSPREE_API_URL or a server without the OAuth routes is obvious.

  it('names the HTTP status and server for a non-OAuth answer', async () => {
    serve({
      device: response(405, '<!DOCTYPE html><title>Formspree</title>'),
      polls: [],
    });

    await run(cmd, args);

    expect(output(console.error)).toContain(
      'Login failed unexpectedly (HTTP 405 from https://formspree.io)',
    );
    expect(process.exitCode).toBe(1);
  });

  it('names an unexpected OAuth error code', async () => {
    serve({ polls: [() => oauthError('invalid_request')] });

    await run(cmd, args);

    expect(output(console.error)).toContain(
      'Login failed unexpectedly (HTTP 400, invalid_request from https://formspree.io)',
    );
    expect(process.exitCode).toBe(1);
  });

  it('names a network error', async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    serve({ device: Promise.reject(refused), polls: [] });

    await run(cmd, args);

    expect(output(console.error)).toContain(
      'Login failed unexpectedly (ECONNREFUSED from https://formspree.io)',
    );
    expect(process.exitCode).toBe(1);
  });
});

describe('choosing the client id', () => {
  it('says the client id is not set when the endpoint has none', async () => {
    delete process.env.FORMSPREE_CLIENT_ID;
    serve({ polls: [] });

    await run(cmd, {});

    expect(post).not.toHaveBeenCalled();
    expect(output(console.error)).toContain(
      'Client ID is not set. Cannot log in to https://formspree.io',
    );
    expectNoClientIdVariable();
    expect(process.exitCode).toBe(1);
  });

  it('ignores a --client-id flag', async () => {
    delete process.env.FORMSPREE_CLIENT_ID;
    serve({ polls: [] });

    await run(cmd, { clientId: 'flag-client' });

    expect(post).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('Client ID is not set');
    expect(process.exitCode).toBe(1);
  });
});

it('polls every 5 seconds when the server sends no interval', async () => {
  serve({
    device: deviceResponse({ interval: undefined }),
    polls: [() => oauthError('authorization_pending'), () => tokenResponse()],
  });

  await run(cmd, args);

  expect(sleeps).toEqual([5000, 5000]);
  expect(output(console.log)).toContain('Logged in');
});

it('keeps polling through a network error', async () => {
  serve({
    polls: [
      () => Promise.reject(new Error('ECONNRESET')),
      () => oauthError('authorization_pending'),
      () => tokenResponse(),
    ],
  });

  await run(cmd, args);

  expect(tokenPolls()).toHaveLength(3);
  expect(output(console.log)).toContain('Logged in');
  expect(process.exitCode).toBeUndefined();
});

it('revokes the previous login when logging in again', async () => {
  fs.writeFileSync(
    credentialsFile,
    JSON.stringify({
      'https://formspree.io': {
        client_id: 'old-client',
        access_token: 'fso_access_0',
        refresh_token: 'fso_refresh_0',
        expires_at: Date.now() + 1000,
        scope: 'projects:write',
      },
    }),
  );
  serve({ polls: [() => tokenResponse()] });
  const served = post.getMockImplementation();
  post.mockImplementation((url, ...rest) =>
    url.endsWith('/oauth/revoke') ? response(200, '') : served!(url, ...rest),
  );

  await run(cmd, args);

  const revokes = post.mock.calls
    .map(parseCall)
    .filter((c) => c.url.endsWith('/oauth/revoke'));
  expect(revokes.map((c) => c.params)).toEqual([
    {
      token: 'fso_refresh_0',
      token_type_hint: 'refresh_token',
      client_id: 'old-client',
    },
  ]);
  const stored = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  expect(stored['https://formspree.io'].access_token).toBe('fso_access_1');
});

describe('choosing the endpoint', () => {
  it('uses FORMSPREE_API_URL and says so', async () => {
    process.env.FORMSPREE_API_URL = 'https://review.formspree.io/';
    serve({ polls: [() => tokenResponse()] });

    await run(cmd, {});

    const [device] = post.mock.calls.map(parseCall);
    expect(device?.url).toBe('https://review.formspree.io/oauth/device');
    expect(tokenPolls()[0]?.url).toBe(
      'https://review.formspree.io/oauth/tokens',
    );
    expect(output(console.log)).toContain(
      'Using https://review.formspree.io (FORMSPREE_API_URL)',
    );

    const stored = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
    expect(Object.keys(stored)).toEqual(['https://review.formspree.io']);
  });

  it('says nothing about the endpoint on formspree.io', async () => {
    serve({ polls: [() => tokenResponse()] });

    await run(cmd, {});

    expect(output(console.log)).not.toContain('FORMSPREE_API_URL');
  });

  it('ignores an --endpoint flag', async () => {
    serve({ polls: [() => tokenResponse()] });

    await run(cmd, { endpoint: 'https://other.formspree.io' });

    const [device] = post.mock.calls.map(parseCall);
    expect(device?.url).toBe('https://formspree.io/oauth/device');
  });
});

describe('API keys', () => {
  afterEach(() => {
    delete process.env.FORMSPREE_API_KEY;
  });

  it('refuses --key, since keys need no login', async () => {
    serve({ polls: [] });

    await run(cmd, { ...args, key: 'fsk_example' });

    expect(post).not.toHaveBeenCalled();
    expect(output(console.error)).toContain("API keys don't need a login");
    expect(output(console.log)).toContain('FORMSPREE_API_KEY');
    expect(process.exitCode).toBe(1);
    expect(fs.existsSync(credentialsFile)).toBe(false);
  });

  it('warns that FORMSPREE_API_KEY will be used instead of the login', async () => {
    process.env.FORMSPREE_API_KEY = 'fsk_example';
    serve({ polls: [() => tokenResponse()] });

    await run(cmd, args);

    expect(output(console.log)).toContain('Logged in');
    expect(output(console.log)).toContain(
      'FORMSPREE_API_KEY is set, so commands use that key instead of this login',
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('does not warn when FORMSPREE_API_KEY is not set', async () => {
    serve({ polls: [() => tokenResponse()] });

    await run(cmd, args);

    expect(output(console.log)).toContain('Logged in');
    expect(output(console.log)).not.toContain('FORMSPREE_API_KEY');
  });
});

it('creates missing config directories, private to the user', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'formspree-cli-'));
  const dir = path.join(root, 'nested', 'formspree');
  process.env.FORMSPREE_CONFIG_DIR = dir;
  serve({ polls: [() => tokenResponse()] });

  await run(cmd, args);

  const stored = JSON.parse(
    fs.readFileSync(path.join(dir, 'credentials.json'), 'utf8'),
  );
  expect(stored['https://formspree.io'].access_token).toBe('fso_access_1');
  expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
  expect(fs.statSync(path.join(root, 'nested')).mode & 0o777).toBe(0o700);
});

describe('opening the login link', () => {
  const LINK = 'https://formspree.io/device?user_code=WDJB-MJHT';

  beforeEach(() => {
    serve({ polls: [() => tokenResponse()] });
  });

  it('opens it in the browser, and still prints it with the code', async () => {
    vi.mocked(browser.available).mockReturnValue(true);

    await run(cmd, args);

    expect(browser.open).toHaveBeenCalledWith(LINK);
    // `login` talks on stdout, so that's the terminal that's checked.
    expect(browser.available).toHaveBeenCalledWith(process.stdout);
    expect(output(console.log)).toContain(
      'Opening this link in your browser to log in:',
    );
    expect(output(console.log)).toContain(LINK);
    expect(output(console.log)).toContain('WDJB-MJHT');
    expect(output(console.log)).toContain('Logged in');
  });

  it('only prints it where there is no browser to open', async () => {
    await run(cmd, args);

    expect(browser.open).not.toHaveBeenCalled();
    expect(output(console.log)).toContain(
      'Open this link in your browser to log in:',
    );
    expect(output(console.log)).toContain(LINK);
  });

  it('only prints it with --no-browser', async () => {
    vi.mocked(browser.available).mockReturnValue(true);

    await run(cmd, { browser: false });

    expect(browser.open).not.toHaveBeenCalled();
    expect(output(console.log)).toContain(
      'Open this link in your browser to log in:',
    );
    expect(output(console.log)).toContain('Logged in');
  });

  it('says so, and carries on, when the browser does not open', async () => {
    vi.mocked(browser.available).mockReturnValue(true);
    vi.mocked(browser.open).mockResolvedValue(false);

    await run(cmd, args);

    expect(output(console.log)).toContain(
      "The browser didn't open. Open the link yourself.",
    );
    expect(output(console.log)).toContain('Logged in');
    expect(process.exitCode).toBeUndefined();
  });
});
