import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  useTempConfigDir,
  parseCall,
  response,
  output,
} from '../helpers/oauth.ts';
import fs from 'node:fs';
import { command as cmd } from '../../src/cmds/logout.ts';
import { run, post } from '../helpers/v1.ts';

vi.mock('axios');

const ENDPOINT = 'https://formspree.io';
const OTHER = 'https://review.formspree.io';

const EXPIRES_AT = Date.now() + 60 * 60 * 1000;

let credentialsFile: string;

const entry = (suffix: string) => ({
  client_id: 'cli-client',
  access_token: `fso_access_${suffix}`,
  refresh_token: `fso_refresh_${suffix}`,
  expires_at: EXPIRES_AT,
  scope: 'projects:write',
});

const stored = () => JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));

beforeEach(() => {
  credentialsFile = useTempConfigDir();
  fs.writeFileSync(
    credentialsFile,
    JSON.stringify({ [ENDPOINT]: entry('0'), [OTHER]: entry('9') }),
  );
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  post.mockReset();
  process.exitCode = undefined;
});

it('revokes the grant and forgets the tokens', async () => {
  post.mockImplementation(() => response(200, ''));

  await run(cmd, {});

  expect(post.mock.calls.map(parseCall)).toEqual([
    {
      url: 'https://formspree.io/oauth/revoke',
      params: {
        token: 'fso_refresh_0',
        token_type_hint: 'refresh_token',
        client_id: 'cli-client',
      },
      headers: expect.any(Object),
    },
  ]);
  expect(stored()[ENDPOINT]).toBeUndefined();
  expect(stored()[OTHER]).toEqual(entry('9'));
  expect(output(console.log)).toContain('Logged out');
  expect(process.exitCode).toBeUndefined();
});

it('says so when not logged in', async () => {
  process.env.FORMSPREE_API_URL = 'https://elsewhere.formspree.io';

  try {
    await run(cmd, {});
  } finally {
    delete process.env.FORMSPREE_API_URL;
  }

  expect(post).not.toHaveBeenCalled();
  expect(output(console.log)).toContain('Not logged in');
  expect(process.exitCode).toBeUndefined();
});

it('forgets the tokens even when revoking fails', async () => {
  post.mockImplementation(() => Promise.reject(new Error('ECONNRESET')));

  await run(cmd, {});

  expect(stored()[ENDPOINT]).toBeUndefined();
  expect(output(console.error)).toContain('could not be revoked');
  expect(output(console.log)).toContain('Connected apps');
  expect(process.exitCode).toBe(1);
});

it('treats an already revoked login as logged out', async () => {
  post.mockImplementation(() => response(400, { error: 'invalid_grant' }));

  await run(cmd, {});

  expect(stored()[ENDPOINT]).toBeUndefined();
  expect(output(console.log)).toContain('Logged out');
  expect(process.exitCode).toBeUndefined();
});

it('uses FORMSPREE_API_URL', async () => {
  post.mockImplementation(() => response(200, ''));
  process.env.FORMSPREE_API_URL = OTHER;

  try {
    await run(cmd, {});
  } finally {
    delete process.env.FORMSPREE_API_URL;
  }

  const [revoke] = post.mock.calls.map(parseCall);
  expect(revoke?.url).toBe('https://review.formspree.io/oauth/revoke');
  expect(revoke?.params.token).toBe('fso_refresh_9');
  expect(stored()[OTHER]).toBeUndefined();
  expect(stored()[ENDPOINT]).toEqual(entry('0'));
});

it('ignores an --endpoint flag', async () => {
  post.mockImplementation(() => response(200, ''));

  await run(cmd, { endpoint: OTHER });

  const [revoke] = post.mock.calls.map(parseCall);
  expect(revoke?.url).toBe('https://formspree.io/oauth/revoke');
  expect(stored()[ENDPOINT]).toBeUndefined();
  expect(stored()[OTHER]).toEqual(entry('9'));
});
