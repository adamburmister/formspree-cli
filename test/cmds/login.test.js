const fs = require('fs');
const axios = require('axios');
const {
  useTempConfigDir,
  parseCall,
  oauthError,
  tokenResponse,
  deviceResponse,
  response,
  output
} = require('../helpers/oauth');

jest.mock('axios');
jest.mock('ora', () => {
  return () => ({
    start: jest.fn(),
    stop: jest.fn()
  });
});

const oauth = require('../../src/oauth');
const cmd = require('../../src/cmds/login');

const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const args = { endpoint: 'https://formspree.io', clientId: 'cli-client' };

let credentialsFile;
let sleeps;

// Routes mocked POSTs: /oauth/device answers with `device`, and each
// /oauth/tokens poll takes the next answer from `polls`.
const serve = ({ device = deviceResponse(), polls }) => {
  const queue = polls.slice();
  axios.post.mockImplementation((url, ...rest) => {
    if (url.endsWith('/oauth/device')) return device;
    if (url.endsWith('/oauth/tokens')) return queue.shift()();
    throw new Error(`Unexpected POST ${url}`);
  });
};

const tokenPolls = () =>
  axios.post.mock.calls.map(parseCall).filter(c => c.url.endsWith('/tokens'));

beforeEach(() => {
  credentialsFile = useTempConfigDir();
  sleeps = [];
  jest.spyOn(oauth, 'sleep').mockImplementation(ms => {
    sleeps.push(ms);
    return Promise.resolve();
  });
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(console, 'error').mockImplementation();
  process.exitCode = undefined;
});

afterEach(() => {
  jest.restoreAllMocks();
  axios.post.mockReset();
  process.exitCode = undefined;
});

it('polls at the interval until approved and stores the tokens', async () => {
  serve({
    polls: [
      () => oauthError('authorization_pending'),
      () => oauthError('authorization_pending'),
      () => tokenResponse()
    ]
  });

  await cmd.handler(args);

  const device = parseCall(axios.post.mock.calls[0]);
  expect(device.url).toBe('https://formspree.io/oauth/device');
  expect(device.params).toEqual({
    client_id: 'cli-client',
    scope: 'projects:write project.forms:write submissions:write keys:write'
  });

  expect(tokenPolls()).toHaveLength(3);
  tokenPolls().forEach(poll => {
    expect(poll.url).toBe('https://formspree.io/oauth/tokens');
    expect(poll.params).toEqual({
      grant_type: DEVICE_GRANT,
      device_code: 'the-device-code',
      client_id: 'cli-client'
    });
  });
  expect(sleeps).toEqual([5000, 5000, 5000]);

  expect(output(console.log)).toContain(
    'https://formspree.io/device?user_code=WDJB-MJHT'
  );
  expect(output(console.log)).toContain('WDJB-MJHT');
  expect(output(console.log)).toContain('Logged in');
  expect(process.exitCode).toBeUndefined();

  const stored = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  expect(stored['https://formspree.io']).toMatchObject({
    client_id: 'cli-client',
    access_token: 'fso_access_1',
    refresh_token: 'fso_refresh_1'
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
      () => tokenResponse()
    ]
  });

  await cmd.handler(args);

  expect(sleeps).toEqual([5000, 5000, 10000, 10000, 15000]);
  expect(output(console.log)).toContain('Logged in');
});

it('stops with an error when the server says the code expired', async () => {
  serve({
    polls: [
      () => oauthError('authorization_pending'),
      () => oauthError('expired_token')
    ]
  });

  await cmd.handler(args);

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
      () => tokenResponse()
    ]
  });

  await cmd.handler(args);

  expect(tokenPolls()).toHaveLength(2);
  expect(sleeps).toEqual([5000, 5000]);
  expect(output(console.error)).toContain('The login code expired');
  expect(process.exitCode).toBe(1);
  expect(fs.existsSync(credentialsFile)).toBe(false);
});

it('stops with an error when the login is denied', async () => {
  serve({ polls: [() => oauthError('access_denied')] });

  await cmd.handler(args);

  expect(output(console.error)).toContain('Login was denied');
  expect(process.exitCode).toBe(1);
  expect(fs.existsSync(credentialsFile)).toBe(false);
});

it('asks to wait when starting logins too often', async () => {
  serve({ device: response(429, 'Too Many Requests'), polls: [] });

  await cmd.handler(args);

  expect(tokenPolls()).toHaveLength(0);
  expect(output(console.error)).toContain('Too many login attempts');
  expect(process.exitCode).toBe(1);
});

it('explains an unknown client id', async () => {
  serve({ device: oauthError('invalid_client', 401), polls: [] });

  await cmd.handler(args);

  expect(output(console.error)).toContain('cli-client');
  expect(output(console.log)).toContain('FORMSPREE_CLIENT_ID');
  expect(process.exitCode).toBe(1);
});

describe('choosing the client id', () => {
  afterEach(() => {
    delete process.env.FORMSPREE_CLIENT_ID;
  });

  it('uses FORMSPREE_CLIENT_ID when there is no --client-id', async () => {
    process.env.FORMSPREE_CLIENT_ID = 'env-client';
    serve({ polls: [() => tokenResponse()] });

    await cmd.handler({ endpoint: 'https://review.formspree.io/' });

    const device = parseCall(axios.post.mock.calls[0]);
    expect(device.url).toBe('https://review.formspree.io/oauth/device');
    expect(device.params.client_id).toBe('env-client');

    const stored = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
    expect(stored['https://review.formspree.io'].client_id).toBe('env-client');
  });

  it('asks for a client id when the endpoint has none', async () => {
    serve({ polls: [] });

    await cmd.handler({ endpoint: 'https://formspree.io' });

    expect(axios.post).not.toHaveBeenCalled();
    expect(output(console.error)).toContain('No OAuth client id');
    expect(output(console.error)).toContain('FORMSPREE_CLIENT_ID');
    expect(process.exitCode).toBe(1);
  });
});

it('polls every 5 seconds when the server sends no interval', async () => {
  serve({
    device: deviceResponse({ interval: undefined }),
    polls: [() => oauthError('authorization_pending'), () => tokenResponse()]
  });

  await cmd.handler(args);

  expect(sleeps).toEqual([5000, 5000]);
  expect(output(console.log)).toContain('Logged in');
});

it('keeps polling through a network error', async () => {
  serve({
    polls: [
      () => Promise.reject(new Error('ECONNRESET')),
      () => oauthError('authorization_pending'),
      () => tokenResponse()
    ]
  });

  await cmd.handler(args);

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
        scope: 'projects:write'
      }
    })
  );
  serve({ polls: [() => tokenResponse()] });
  const post = axios.post.getMockImplementation();
  axios.post.mockImplementation((url, ...rest) =>
    url.endsWith('/oauth/revoke') ? response(200, '') : post(url, ...rest)
  );

  await cmd.handler(args);

  const revokes = axios.post.mock.calls
    .map(parseCall)
    .filter(c => c.url.endsWith('/oauth/revoke'));
  expect(revokes.map(c => c.params)).toEqual([
    {
      token: 'fso_refresh_0',
      token_type_hint: 'refresh_token',
      client_id: 'old-client'
    }
  ]);
  const stored = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
  expect(stored['https://formspree.io'].access_token).toBe('fso_access_1');
});
