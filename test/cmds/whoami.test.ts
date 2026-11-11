import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useTempConfigDir,
  parseCall,
  oauthError,
  tokenResponse,
  response,
  output,
  type Reply,
} from '../helpers/oauth.ts';
import fs from 'node:fs';
import { command as cmd } from '../../src/cmds/whoami.ts';
import { run, request, post, type SentRequest } from '../helpers/v1.ts';
import type { Credentials } from '../../src/credentials.ts';

vi.mock('axios');

const ENDPOINT = 'https://formspree.io';
const HOUR = 60 * 60 * 1000;

let credentialsFile: string;

const store = (entry: Partial<Credentials>): void => {
  fs.writeFileSync(
    credentialsFile,
    JSON.stringify({
      [ENDPOINT]: {
        client_id: 'cli-client',
        access_token: 'fso_access_0',
        refresh_token: 'fso_refresh_0',
        expires_at: Date.now() + HOUR,
        scope: 'projects:write',
        ...entry,
      },
    }),
    { mode: 0o600 },
  );
};

const stored = () =>
  JSON.parse(fs.readFileSync(credentialsFile, 'utf8'))[ENDPOINT];

const accounts = response(200, {
  accounts: [
    { id: 1, name: 'Personal', kind: 'personal' },
    { id: 2, name: 'API Keys Team', kind: 'team' },
  ],
});

// Answers /api/v1 with `api` for a bearer in `valid`, else with a 401.
const serveApi = (
  valid: string[],
  api: (config: SentRequest) => Promise<Reply> = () => accounts,
): void => {
  request.mockImplementation((config) => {
    const bearer = config.headers.Authorization?.replace('Bearer ', '') ?? '';
    return valid.includes(bearer) ? api(config) : response(401, {});
  });
};

const bearers = () =>
  request.mock.calls.map(([config]) => config.headers.Authorization);

const refreshes = () => post.mock.calls.map(parseCall);

beforeEach(() => {
  credentialsFile = useTempConfigDir();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  request.mockReset();
  post.mockReset();
  process.exitCode = undefined;
});

it('lists the accounts the stored token covers', async () => {
  store({});
  serveApi(['fso_access_0']);

  await run(cmd, {});

  const config = request.mock.calls[0]?.[0];
  expect(config?.method).toBe('get');
  expect(config?.url).toBe('https://formspree.io/api/v1/accounts');
  expect(bearers()).toEqual(['Bearer fso_access_0']);
  expect(post).not.toHaveBeenCalled();

  expect(output(console.log)).toContain('Personal');
  expect(output(console.log)).toContain('API Keys Team');
  expect(process.exitCode).toBeUndefined();
});

it('asks to log in when there is no stored token', async () => {
  await run(cmd, {});

  expect(request).not.toHaveBeenCalled();
  expect(output(console.error)).toContain('Not logged in');
  expect(output(console.error)).toContain('formspree login');
  expect(process.exitCode).toBe(1);
});

it('refreshes an expired token first and saves the rotated pair', async () => {
  store({ expires_at: Date.now() - 1000 });
  serveApi(['fso_access_1']);
  post.mockImplementation(() => tokenResponse('1'));

  await run(cmd, {});

  expect(refreshes()).toEqual([
    {
      url: 'https://formspree.io/oauth/tokens',
      params: {
        grant_type: 'refresh_token',
        refresh_token: 'fso_refresh_0',
        client_id: 'cli-client',
      },
      headers: expect.any(Object),
    },
  ]);
  expect(bearers()).toEqual(['Bearer fso_access_1']);

  expect(stored()).toMatchObject({
    client_id: 'cli-client',
    access_token: 'fso_access_1',
    refresh_token: 'fso_refresh_1',
  });
  expect(stored().expires_at).toBeGreaterThan(Date.now() + 29 * 24 * HOUR);
  expect(fs.statSync(credentialsFile).mode & 0o777).toBe(0o600);
  expect(output(console.log)).toContain('Personal');
});

it('refreshes once and retries when the API answers 401', async () => {
  store({});
  serveApi(['fso_access_1']);
  post.mockImplementation(() => tokenResponse('1'));

  await run(cmd, {});

  expect(refreshes()).toHaveLength(1);
  expect(bearers()).toEqual(['Bearer fso_access_0', 'Bearer fso_access_1']);
  expect(stored().refresh_token).toBe('fso_refresh_1');
  expect(output(console.log)).toContain('Personal');
  expect(process.exitCode).toBeUndefined();
});

it('asks for a fresh login when the grant was revoked', async () => {
  store({});
  serveApi([]);
  post.mockImplementation(() => oauthError('invalid_grant'));

  await run(cmd, {});

  expect(refreshes()).toHaveLength(1);
  expect(bearers()).toEqual(['Bearer fso_access_0']);
  expect(output(console.error)).toContain('formspree login');
  expect(process.exitCode).toBe(1);
  expect(stored()).toBeUndefined();
});

it('asks for a fresh login when an expired token cannot be refreshed', async () => {
  store({ expires_at: Date.now() - 1000 });
  post.mockImplementation(() => oauthError('invalid_grant'));

  await run(cmd, {});

  expect(request).not.toHaveBeenCalled();
  expect(output(console.error)).toContain('formspree login');
  expect(process.exitCode).toBe(1);
  expect(stored()).toBeUndefined();
});

it('asks for a fresh login when the refreshed token is refused too', async () => {
  store({});
  serveApi([]);
  post.mockImplementation(() => tokenResponse('1'));

  await run(cmd, {});

  expect(refreshes()).toHaveLength(1);
  expect(bearers()).toEqual(['Bearer fso_access_0', 'Bearer fso_access_1']);
  expect(output(console.error)).toContain('formspree login');
  expect(process.exitCode).toBe(1);
});

describe('when several CLI processes share the credentials', () => {
  // A second refresh with a spent token would be a replay, and the server
  // would revoke the grant, so these must each send at most one.

  it('refreshes an expired token only once for concurrent calls', async () => {
    store({ expires_at: Date.now() - 1000 });
    serveApi(['fso_access_1']);
    let issued = 0;
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          issued += 1;
          setTimeout(() => resolve(tokenResponse(`${issued}`)), 50);
        }),
    );

    await Promise.all([run(cmd, {}), run(cmd, {})]);

    expect(refreshes()).toHaveLength(1);
    expect(bearers()).toEqual(['Bearer fso_access_1', 'Bearer fso_access_1']);
    expect(stored().refresh_token).toBe('fso_refresh_1');
    expect(process.exitCode).toBeUndefined();
  });

  it('uses a token another process already rotated instead of refreshing', async () => {
    store({});
    serveApi(['fso_access_1']);
    request.mockImplementationOnce(() => {
      // Another process refreshes while this request is in flight.
      store({ access_token: 'fso_access_1', refresh_token: 'fso_refresh_1' });
      return response(401, {});
    });

    await run(cmd, {});

    expect(post).not.toHaveBeenCalled();
    expect(bearers()).toEqual(['Bearer fso_access_0', 'Bearer fso_access_1']);
    expect(output(console.log)).toContain('Personal');
    expect(process.exitCode).toBeUndefined();
  });
});

it('asks for a fresh login when the client is no longer recognized', async () => {
  store({ expires_at: Date.now() - 1000 });
  post.mockImplementation(() => oauthError('invalid_client', 401));

  await run(cmd, {});

  expect(request).not.toHaveBeenCalled();
  expect(output(console.error)).toContain('formspree login');
  expect(process.exitCode).toBe(1);
  expect(stored()).toBeUndefined();
});

it('takes over a lock left behind by a process that died', async () => {
  store({ expires_at: Date.now() - 1000 });
  // No process has this pid, so its lock is abandoned.
  fs.writeFileSync(`${credentialsFile}.lock`, '2147483646:deadbeef');
  serveApi(['fso_access_1']);
  post.mockImplementation(() => tokenResponse('1'));

  await run(cmd, {});

  expect(refreshes()).toHaveLength(1);
  expect(bearers()).toEqual(['Bearer fso_access_1']);
  expect(fs.existsSync(`${credentialsFile}.lock`)).toBe(false);
  expect(process.exitCode).toBeUndefined();
});

it('names a personal account that has no name', async () => {
  store({});
  serveApi(['fso_access_0'], () =>
    response(200, {
      accounts: [{ id: 'abc123', name: null, kind: 'personal' }],
    }),
  );

  await run(cmd, {});

  expect(output(console.log)).toContain('Personal account (personal, abc123)');
  expect(output(console.log)).not.toContain('null');
});

describe('with an API key', () => {
  afterEach(() => {
    delete process.env.FORMSPREE_API_KEY;
  });

  it('uses FORMSPREE_API_KEY instead of the stored login', async () => {
    store({ expires_at: Date.now() - 1000 });
    const before = stored();
    process.env.FORMSPREE_API_KEY = 'fsk_from_env';
    serveApi(['fsk_from_env']);

    await run(cmd, {});

    expect(bearers()).toEqual(['Bearer fsk_from_env']);
    expect(post).not.toHaveBeenCalled();
    expect(stored()).toEqual(before);
    expect(output(console.log)).toContain('API key');
    expect(output(console.log)).toContain('Personal');
    expect(process.exitCode).toBeUndefined();
  });

  it('prefers --key over FORMSPREE_API_KEY', async () => {
    process.env.FORMSPREE_API_KEY = 'fsk_from_env';
    serveApi(['fsk_from_flag']);

    await run(cmd, { key: 'fsk_from_flag' });

    expect(bearers()).toEqual(['Bearer fsk_from_flag']);
    expect(output(console.log)).toContain('Personal');
    expect(process.exitCode).toBeUndefined();
  });

  it('works without a stored login', async () => {
    serveApi(['fsk_from_flag']);

    await run(cmd, { key: 'fsk_from_flag' });

    expect(bearers()).toEqual(['Bearer fsk_from_flag']);
    expect(fs.existsSync(credentialsFile)).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  it('reports a rejected key without suggesting a login', async () => {
    store({});
    const before = stored();
    request.mockImplementation(() =>
      response(401, { status: 401, detail: 'This API key was revoked.' }),
    );

    await run(cmd, { key: 'fsk_revoked' });

    expect(bearers()).toEqual(['Bearer fsk_revoked']);
    expect(post).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('This API key was revoked.');
    expect(output(console.error)).not.toContain('formspree login');
    expect(output(console.log)).toContain('FORMSPREE_API_KEY');
    expect(stored()).toEqual(before);
    expect(process.exitCode).toBe(1);
  });
});

it('uses FORMSPREE_API_URL and says so', async () => {
  fs.writeFileSync(
    credentialsFile,
    JSON.stringify({
      'https://review.formspree.io': {
        client_id: 'cli-client',
        access_token: 'fso_access_0',
        refresh_token: 'fso_refresh_0',
        expires_at: Date.now() + HOUR,
        scope: 'projects:write',
      },
    }),
  );
  process.env.FORMSPREE_API_URL = 'https://review.formspree.io';
  serveApi(['fso_access_0']);

  try {
    await run(cmd, {});
  } finally {
    delete process.env.FORMSPREE_API_URL;
  }

  const config = request.mock.calls[0]?.[0];
  expect(config?.url).toBe('https://review.formspree.io/api/v1/accounts');
  expect(output(console.log)).toContain(
    'Using https://review.formspree.io (FORMSPREE_API_URL)',
  );
  expect(process.exitCode).toBeUndefined();
});

it('ignores an --endpoint flag', async () => {
  store({});
  serveApi(['fso_access_0']);

  await run(cmd, { endpoint: 'https://review.formspree.io' });

  const config = request.mock.calls[0]?.[0];
  expect(config?.url).toBe('https://formspree.io/api/v1/accounts');
  expect(output(console.log)).not.toContain('FORMSPREE_API_URL');
});

describe('the login hint', () => {
  const hint = () =>
    output(console.error)
      .split('\n')
      .find((line) => line.includes('formspree login'))
      ?.trim();

  afterEach(() => {
    delete process.env.FORMSPREE_API_URL;
  });

  it('is plain formspree login on the default endpoint', async () => {
    await run(cmd, {});

    expect(hint()).toBe('Run $ formspree login');
  });

  it('is plain formspree login when FORMSPREE_API_URL picked the endpoint', async () => {
    process.env.FORMSPREE_API_URL = 'https://review.formspree.io';

    await run(cmd, {});

    expect(hint()).toBe('Run $ formspree login');
  });
});
