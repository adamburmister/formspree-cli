import fs from 'node:fs';
import axios from 'axios';
import type { Mock } from 'vitest';
import type { Reply } from './oauth.ts';

export const ENDPOINT = 'https://formspree.io';

/** What the code under test passes to axios.request. */
export interface SentRequest {
  method: string;
  url: string;
  params?: Record<string, string>;
  data?: unknown;
  headers: Record<string, string>;
}

/**
 * axios, mocked by the test file with `vi.mock('axios')`. These are its
 * two functions the CLI calls, typed as the mocks they are and by what
 * the tests answer with.
 */
export const request = axios.request as unknown as Mock<
  (config: SentRequest) => Promise<Reply>
>;
export const post = axios.post as unknown as Mock<
  (
    url: string,
    body?: string,
    config?: { headers?: Record<string, string> },
  ) => Promise<Reply>
>;

/**
 * Calls a command's handler with only the arguments a test cares about.
 * yargs fills in the rest in real use.
 */
export const run = <A>(
  command: { handler: (args: A) => void | Promise<void> },
  args: Partial<A> = {},
): void | Promise<void> => command.handler(args as A);

/** Stores a login for formspree.io that hasn't expired. */
export const login = (credentialsFile: string): void => {
  fs.writeFileSync(
    credentialsFile,
    JSON.stringify({
      [ENDPOINT]: {
        client_id: 'cli-client',
        access_token: 'fso_access_0',
        refresh_token: 'fso_refresh_0',
        expires_at: Date.now() + 60 * 60 * 1000,
        scope: 'projects:write project.forms:write',
      },
    }),
    { mode: 0o600 },
  );
};

/** Answers every API request with the given response. */
export const answer = (
  status: number,
  data: unknown,
  headers: Record<string, string> = {},
): void => {
  request.mockImplementation(() => Promise.resolve({ status, data, headers }));
};

/** The API requests sent so far, without the parts every request shares. */
export const requests = (): Omit<SentRequest, 'headers'>[] =>
  request.mock.calls.map(([config]) => ({
    method: config.method,
    url: config.url,
    ...(config.params ? { params: config.params } : {}),
    ...(config.data ? { data: config.data } : {}),
  }));

/** The headers of the nth API request. */
export const headers = (n = 0): Record<string, string> => {
  const call = request.mock.calls[n];
  if (!call) throw new Error(`There was no request number ${n}`);
  return call[0].headers;
};

export const problem = (
  status: number,
  detail: string,
  extra: Record<string, unknown> = {},
) => ({
  type: 'https://help.formspree.io/problems/x',
  title: 'A problem',
  status,
  detail,
  category: 'validation',
  retryable: false,
  owner_action_required: false,
  ok: false,
  error: { message: detail, code: 'X' },
  ...extra,
});
