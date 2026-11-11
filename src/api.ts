import axios, { type AxiosResponse, type Method } from 'axios';
import * as credentials from './credentials.ts';
import type { Credentials } from './credentials.ts';
import * as oauth from './oauth.ts';
import { OAuthError } from './oauth.ts';
import type { Problem } from './types.ts';
import { userAgent } from './version.ts';

// Refresh a little early so a token doesn't expire mid-request.
const EXPIRY_MARGIN = 60 * 1000;

/** A v1 API request. `params` is the query string, `data` a JSON body. */
export interface ApiRequest {
  method: Method;
  path: string;
  params?: Record<string, string> | undefined;
  data?: unknown;
  headers?: Record<string, string> | undefined;
}

/** A v1 API response, whatever its status. */
export type ApiResponse<T = unknown> = Pick<
  AxiosResponse<T>,
  'status' | 'data' | 'headers'
>;

/**
 * Thrown when there is no usable token: never logged in, or the grant
 * was revoked or expired. The fix is always `formspree login`. `response`
 * is the API's 401, when it was the API that refused the token.
 */
export class LoginRequired extends Error {
  response: ApiResponse | undefined;

  constructor(reason?: string, response?: ApiResponse) {
    super(reason || 'Not logged in');
    this.name = 'LoginRequired';
    this.response = response;
  }
}

/**
 * Thrown when the server refuses an API key. Logging in won't help:
 * the key itself has to be fixed or replaced. `response` is the API's 401.
 */
export class InvalidKey extends Error {
  readonly response: ApiResponse | undefined;

  constructor(reason?: string, response?: ApiResponse) {
    super(reason || 'The API key was not accepted');
    this.name = 'InvalidKey';
    this.response = response;
  }
}

/**
 * The API key to use instead of the stored login: the --key flag, then
 * $FORMSPREE_API_KEY. Returns null when neither is set.
 */
export const apiKey = (flag?: string): string | null =>
  flag || process.env.FORMSPREE_API_KEY || null;

/**
 * Sends a v1 API request with a bearer credential: an OAuth access token
 * or an account key, which the server accepts the same way. Without a
 * bearer the request carries no credential.
 */
const send = <T>(
  endpoint: string,
  bearer: string | null,
  { method, path, params, data, headers }: ApiRequest,
): Promise<ApiResponse<T>> =>
  axios.request<T>({
    method,
    url: `${endpoint}${path}`,
    params,
    data,
    headers: {
      ...headers,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      'User-Agent': userAgent,
    },
    timeout: oauth.REQUEST_TIMEOUT,
    validateStatus: () => true,
  });

/** Calls a v1 route that takes no credential, so it works with no login. */
export const anonymous = <T>(
  endpoint: string,
  request: ApiRequest,
): Promise<ApiResponse<T>> => send<T>(endpoint, null, request);

/** Whether the entry's access token has expired, or is about to. */
const expired = (entry: Credentials): boolean =>
  Date.now() >= entry.expires_at - EXPIRY_MARGIN;

/**
 * Swaps the refresh token for a new pair and stores it, holding the
 * credentials lock throughout. The server rotates on every refresh and
 * revokes the grant if a spent refresh token comes back, so if another
 * process rotated the pair since `stale` was read, this uses its pair
 * rather than spend the old token again.
 */
const refresh = async (
  endpoint: string,
  stale: Credentials,
): Promise<Credentials> => {
  let revoked = false;

  const fresh = await credentials.update(endpoint, async (current) => {
    if (!current || current.access_token !== stale.access_token) {
      return current;
    }

    try {
      const data = await oauth.refreshToken({
        endpoint,
        clientId: current.client_id,
        refreshToken: current.refresh_token,
      });
      return oauth.toCredentials(data, current.client_id);
    } catch (error) {
      // The grant is gone: revoked, expired, killed by a replayed
      // refresh token, or its client was deleted (a review app
      // redeploy). The stored pair is useless now.
      if (
        error instanceof OAuthError &&
        (error.code === 'invalid_grant' || error.code === 'invalid_client')
      ) {
        revoked = true;
        return null;
      }
      throw error;
    }
  });

  if (revoked) {
    throw new LoginRequired('Your login has expired or was revoked');
  }
  if (!fresh) throw new LoginRequired();
  return fresh;
};

/**
 * Calls the v1 API with an API key if one is given, else with the stored
 * token for the endpoint. Keys are sent as they are: no refresh, no lock.
 */
export const request = async <T>(
  endpoint: string,
  req: ApiRequest,
  { key }: { key?: string | null } = {},
): Promise<ApiResponse<T>> => {
  if (key) {
    const response = await send<T>(endpoint, key, req);
    if (response.status === 401) {
      const problem = response.data as Problem | null | undefined;
      throw new InvalidKey(problem?.detail, response);
    }
    return response;
  }

  let entry = credentials.read(endpoint);
  if (!entry) throw new LoginRequired();
  if (expired(entry)) entry = await refresh(endpoint, entry);

  let response = await send<T>(endpoint, entry.access_token, req);
  if (response.status !== 401) return response;

  // The token may have been rotated or revoked since it was stored.
  // Refresh once; a second 401 means the grant no longer works. If the
  // refresh shows the login is gone, the 401 is still the API's answer.
  try {
    entry = await refresh(endpoint, entry);
  } catch (error) {
    if (error instanceof LoginRequired) error.response = response;
    throw error;
  }

  response = await send<T>(endpoint, entry.access_token, req);
  if (response.status === 401) {
    throw new LoginRequired('Your login was not accepted', response);
  }
  return response;
};
