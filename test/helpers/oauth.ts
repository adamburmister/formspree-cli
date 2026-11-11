import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi, type Mock } from 'vitest';

/** A mocked HTTP response: what the code under test reads of one. */
export interface Reply {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
}

/**
 * Points the credentials store at a fresh temporary directory.
 * Returns the path of the credentials file inside it.
 */
export const useTempConfigDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formspree-cli-'));
  process.env.FORMSPREE_CONFIG_DIR = dir;
  return path.join(dir, 'credentials.json');
};

/** Turns a mocked axios.post call into { url, params, headers }. */
export const parseCall = ([url, body, config]: [
  url: string,
  body?: string,
  config?: { headers?: Record<string, string> },
]) => ({
  url,
  params: body ? Object.fromEntries(new URLSearchParams(body)) : {},
  headers: config?.headers ?? {},
});

export const response = (status: number, data: unknown): Promise<Reply> =>
  Promise.resolve({ status, data });

export const oauthError = (error: string, status = 400): Promise<Reply> =>
  response(status, { error, error_description: `${error} description` });

export const tokenResponse = (
  suffix = '1',
  extra: Record<string, unknown> = {},
): Promise<Reply> =>
  response(200, {
    access_token: `fso_access_${suffix}`,
    refresh_token: `fso_refresh_${suffix}`,
    token_type: 'Bearer',
    expires_in: 2592000,
    scope: 'projects:write',
    accounts: [{ id: 1, name: 'Personal', kind: 'personal' }],
    ...extra,
  });

export const deviceResponse = (
  extra: Record<string, unknown> = {},
): Promise<Reply> =>
  response(200, {
    device_code: 'the-device-code',
    user_code: 'WDJB-MJHT',
    verification_uri: 'https://formspree.io/device',
    verification_uri_complete:
      'https://formspree.io/device?user_code=WDJB-MJHT',
    expires_in: 900,
    interval: 5,
    ...extra,
  });

/** Strips ANSI color codes, so assertions don't depend on the terminal. */
export const plain = (text: string): string =>
  // eslint-disable-next-line no-control-regex
  text.replace(/\u001b\[[0-9;]*m/g, '');

/**
 * Everything a spied-on function was called with, one call per line,
 * without colors. Usually `console.log` or `console.error`.
 */
export const output = (spied: (...args: never[]) => unknown): string =>
  plain(
    vi
      .mocked(spied as Mock)
      .mock.calls.map((args) => args.join(' '))
      .join('\n'),
  );

/** Silences and records console.log and console.error. */
export const muteConsole = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
};
