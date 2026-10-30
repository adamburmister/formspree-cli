const fs = require('fs');
const axios = require('axios');
const {
  useTempConfigDir,
  parseCall,
  oauthError,
  tokenResponse,
  response,
  output
} = require('../helpers/oauth');

jest.mock('axios');

const cmd = require('../../src/cmds/whoami');

const ENDPOINT = 'https://formspree.io';
const HOUR = 60 * 60 * 1000;

let credentialsFile;

const store = entry => {
  fs.writeFileSync(
    credentialsFile,
    JSON.stringify({
      [ENDPOINT]: {
        client_id: 'cli-client',
        access_token: 'fso_access_0',
        refresh_token: 'fso_refresh_0',
        expires_at: Date.now() + HOUR,
        scope: 'projects:write',
        ...entry
      }
    }),
    { mode: 0o600 }
  );
};

const stored = () =>
  JSON.parse(fs.readFileSync(credentialsFile, 'utf8'))[ENDPOINT];

const accounts = response(200, {
  accounts: [
    { id: 1, name: 'Personal', kind: 'personal' },
    { id: 2, name: 'API Keys Team', kind: 'team' }
  ]
});

// Answers /api/v1 with `api` for a bearer in `valid`, else with a 401.
const serveApi = (valid, api = () => accounts) => {
  axios.request.mockImplementation(config => {
    const bearer = config.headers.Authorization.replace('Bearer ', '');
    return valid.includes(bearer) ? api(config) : response(401, {});
  });
};

const bearers = () =>
  axios.request.mock.calls.map(([config]) => config.headers.Authorization);

const refreshes = () => axios.post.mock.calls.map(parseCall);

beforeEach(() => {
  credentialsFile = useTempConfigDir();
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(console, 'error').mockImplementation();
  process.exitCode = undefined;
});

afterEach(() => {
  jest.restoreAllMocks();
  axios.request.mockReset();
  axios.post.mockReset();
  process.exitCode = undefined;
});

it('lists the accounts the stored token covers', async () => {
  store({});
  serveApi(['fso_access_0']);

  await cmd.handler({ endpoint: ENDPOINT });

  const [config] = axios.request.mock.calls[0];
  expect(config.method).toBe('get');
  expect(config.url).toBe('https://formspree.io/api/v1/accounts');
  expect(bearers()).toEqual(['Bearer fso_access_0']);
  expect(axios.post).not.toHaveBeenCalled();

  expect(output(console.log)).toContain('Personal');
  expect(output(console.log)).toContain('API Keys Team');
  expect(process.exitCode).toBeUndefined();
});

it('asks to log in when there is no stored token', async () => {
  await cmd.handler({ endpoint: ENDPOINT });

  expect(axios.request).not.toHaveBeenCalled();
  expect(output(console.error)).toContain('Not logged in');
  expect(output(console.error)).toContain('formspree login');
  expect(process.exitCode).toBe(1);
});

it('refreshes an expired token first and saves the rotated pair', async () => {
  store({ expires_at: Date.now() - 1000 });
  serveApi(['fso_access_1']);
  axios.post.mockImplementation(() => tokenResponse('1'));

  await cmd.handler({ endpoint: ENDPOINT });

  expect(refreshes()).toEqual([
    {
      url: 'https://formspree.io/oauth/tokens',
      params: {
        grant_type: 'refresh_token',
        refresh_token: 'fso_refresh_0',
        client_id: 'cli-client'
      },
      headers: expect.any(Object)
    }
  ]);
  expect(bearers()).toEqual(['Bearer fso_access_1']);

  expect(stored()).toMatchObject({
    client_id: 'cli-client',
    access_token: 'fso_access_1',
    refresh_token: 'fso_refresh_1'
  });
  expect(stored().expires_at).toBeGreaterThan(Date.now() + 29 * 24 * HOUR);
  expect(fs.statSync(credentialsFile).mode & 0o777).toBe(0o600);
  expect(output(console.log)).toContain('Personal');
});

it('refreshes once and retries when the API answers 401', async () => {
  store({});
  serveApi(['fso_access_1']);
  axios.post.mockImplementation(() => tokenResponse('1'));

  await cmd.handler({ endpoint: ENDPOINT });

  expect(refreshes()).toHaveLength(1);
  expect(bearers()).toEqual(['Bearer fso_access_0', 'Bearer fso_access_1']);
  expect(stored().refresh_token).toBe('fso_refresh_1');
  expect(output(console.log)).toContain('Personal');
  expect(process.exitCode).toBeUndefined();
});

it('asks for a fresh login when the grant was revoked', async () => {
  store({});
  serveApi([]);
  axios.post.mockImplementation(() => oauthError('invalid_grant'));

  await cmd.handler({ endpoint: ENDPOINT });

  expect(refreshes()).toHaveLength(1);
  expect(bearers()).toEqual(['Bearer fso_access_0']);
  expect(output(console.error)).toContain('formspree login');
  expect(process.exitCode).toBe(1);
  expect(stored()).toBeUndefined();
});

it('asks for a fresh login when an expired token cannot be refreshed', async () => {
  store({ expires_at: Date.now() - 1000 });
  axios.post.mockImplementation(() => oauthError('invalid_grant'));

  await cmd.handler({ endpoint: ENDPOINT });

  expect(axios.request).not.toHaveBeenCalled();
  expect(output(console.error)).toContain('formspree login');
  expect(process.exitCode).toBe(1);
  expect(stored()).toBeUndefined();
});

it('asks for a fresh login when the refreshed token is refused too', async () => {
  store({});
  serveApi([]);
  axios.post.mockImplementation(() => tokenResponse('1'));

  await cmd.handler({ endpoint: ENDPOINT });

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
    axios.post.mockImplementation(
      () =>
        new Promise(resolve => {
          issued += 1;
          setTimeout(() => resolve(tokenResponse(`${issued}`)), 50);
        })
    );

    await Promise.all([
      cmd.handler({ endpoint: ENDPOINT }),
      cmd.handler({ endpoint: ENDPOINT })
    ]);

    expect(refreshes()).toHaveLength(1);
    expect(bearers()).toEqual(['Bearer fso_access_1', 'Bearer fso_access_1']);
    expect(stored().refresh_token).toBe('fso_refresh_1');
    expect(process.exitCode).toBeUndefined();
  });

  it('uses a token another process already rotated instead of refreshing', async () => {
    store({});
    serveApi(['fso_access_1']);
    axios.request.mockImplementationOnce(() => {
      // Another process refreshes while this request is in flight.
      store({ access_token: 'fso_access_1', refresh_token: 'fso_refresh_1' });
      return response(401, {});
    });

    await cmd.handler({ endpoint: ENDPOINT });

    expect(axios.post).not.toHaveBeenCalled();
    expect(bearers()).toEqual(['Bearer fso_access_0', 'Bearer fso_access_1']);
    expect(output(console.log)).toContain('Personal');
    expect(process.exitCode).toBeUndefined();
  });
});

it('asks for a fresh login when the client is no longer recognized', async () => {
  store({ expires_at: Date.now() - 1000 });
  axios.post.mockImplementation(() => oauthError('invalid_client', 401));

  await cmd.handler({ endpoint: ENDPOINT });

  expect(axios.request).not.toHaveBeenCalled();
  expect(output(console.error)).toContain('formspree login');
  expect(process.exitCode).toBe(1);
  expect(stored()).toBeUndefined();
});

it('takes over a lock left behind by a process that died', async () => {
  store({ expires_at: Date.now() - 1000 });
  // No process has this pid, so its lock is abandoned.
  fs.writeFileSync(`${credentialsFile}.lock`, '2147483646:deadbeef');
  serveApi(['fso_access_1']);
  axios.post.mockImplementation(() => tokenResponse('1'));

  await cmd.handler({ endpoint: ENDPOINT });

  expect(refreshes()).toHaveLength(1);
  expect(bearers()).toEqual(['Bearer fso_access_1']);
  expect(fs.existsSync(`${credentialsFile}.lock`)).toBe(false);
  expect(process.exitCode).toBeUndefined();
});

it('names a personal account that has no name', async () => {
  store({});
  serveApi(['fso_access_0'], () =>
    response(200, {
      accounts: [{ id: 'abc123', name: null, kind: 'personal' }]
    })
  );

  await cmd.handler({ endpoint: ENDPOINT });

  expect(output(console.log)).toContain('Personal account (personal, abc123)');
  expect(output(console.log)).not.toContain('null');
});
