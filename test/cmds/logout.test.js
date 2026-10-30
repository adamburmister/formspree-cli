const fs = require('fs');
const axios = require('axios');
const {
  useTempConfigDir,
  parseCall,
  response,
  output
} = require('../helpers/oauth');

jest.mock('axios');

const cmd = require('../../src/cmds/logout');

const ENDPOINT = 'https://formspree.io';
const OTHER = 'https://review.formspree.io';

const EXPIRES_AT = Date.now() + 60 * 60 * 1000;

let credentialsFile;

const entry = suffix => ({
  client_id: 'cli-client',
  access_token: `fso_access_${suffix}`,
  refresh_token: `fso_refresh_${suffix}`,
  expires_at: EXPIRES_AT,
  scope: 'projects:write'
});

const stored = () => JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));

beforeEach(() => {
  credentialsFile = useTempConfigDir();
  fs.writeFileSync(
    credentialsFile,
    JSON.stringify({ [ENDPOINT]: entry('0'), [OTHER]: entry('9') })
  );
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(console, 'error').mockImplementation();
  process.exitCode = undefined;
});

afterEach(() => {
  jest.restoreAllMocks();
  axios.post.mockReset();
  process.exitCode = undefined;
});

it('revokes the grant and forgets the tokens', async () => {
  axios.post.mockImplementation(() => response(200, ''));

  await cmd.handler({ endpoint: ENDPOINT });

  expect(axios.post.mock.calls.map(parseCall)).toEqual([
    {
      url: 'https://formspree.io/oauth/revoke',
      params: {
        token: 'fso_refresh_0',
        token_type_hint: 'refresh_token',
        client_id: 'cli-client'
      },
      headers: expect.any(Object)
    }
  ]);
  expect(stored()[ENDPOINT]).toBeUndefined();
  expect(stored()[OTHER]).toEqual(entry('9'));
  expect(output(console.log)).toContain('Logged out');
  expect(process.exitCode).toBeUndefined();
});

it('says so when not logged in', async () => {
  await cmd.handler({ endpoint: 'https://elsewhere.formspree.io' });

  expect(axios.post).not.toHaveBeenCalled();
  expect(output(console.log)).toContain('Not logged in');
  expect(process.exitCode).toBeUndefined();
});

it('forgets the tokens even when revoking fails', async () => {
  axios.post.mockImplementation(() => Promise.reject(new Error('ECONNRESET')));

  await cmd.handler({ endpoint: ENDPOINT });

  expect(stored()[ENDPOINT]).toBeUndefined();
  expect(output(console.error)).toContain('could not be revoked');
  expect(output(console.log)).toContain('Connected apps');
  expect(process.exitCode).toBe(1);
});

it('treats an already revoked login as logged out', async () => {
  axios.post.mockImplementation(() =>
    response(400, { error: 'invalid_grant' })
  );

  await cmd.handler({ endpoint: ENDPOINT });

  expect(stored()[ENDPOINT]).toBeUndefined();
  expect(output(console.log)).toContain('Logged out');
  expect(process.exitCode).toBeUndefined();
});

it('uses FORMSPREE_API_URL when there is no --endpoint', async () => {
  axios.post.mockImplementation(() => response(200, ''));
  process.env.FORMSPREE_API_URL = OTHER;

  try {
    await cmd.handler({});
  } finally {
    delete process.env.FORMSPREE_API_URL;
  }

  const [revoke] = axios.post.mock.calls.map(parseCall);
  expect(revoke.url).toBe('https://review.formspree.io/oauth/revoke');
  expect(revoke.params.token).toBe('fso_refresh_9');
  expect(stored()[OTHER]).toBeUndefined();
  expect(stored()[ENDPOINT]).toEqual(entry('0'));
});
