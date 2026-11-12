import axios, { type AxiosResponse } from 'axios';
import type { Credentials } from './credentials.ts';
import { sleep } from './util.ts';
import { userAgent } from './version.ts';

export const DEFAULT_ENDPOINT = 'https://formspree.io';
export const DEFAULT_SCOPE =
  'projects:write project.forms:write submissions:write keys:write';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

// Keep well under the credentials lock's stale timeout, so a hung refresh
// fails before another process decides the lock is abandoned.
export const REQUEST_TIMEOUT = 15 * 1000;
// Consecutive network errors to ride out while polling.
const MAX_NETWORK_FAILURES = 3;

// The public "Formspree CLI" OAuth client's id on each endpoint. Any other
// endpoint needs FORMSPREE_CLIENT_ID.
const CLIENT_IDS: Record<string, string> = {
  'https://formspree.io': '3133091799963270330',
};

/** A device authorization, as /oauth/device answers (RFC 8628 §3.2). */
export interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in?: number;
  interval?: number;
}

/** A token pair, as /oauth/tokens answers. */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}

interface OAuthErrorBody {
  error?: string;
  error_description?: string;
}

/**
 * An error from the OAuth endpoints. `code` is the OAuth error code, or
 * one of the CLI's own: `rate_limited`, `expired_token`, `server_error`.
 */
export class OAuthError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, description?: string, status?: number) {
    super(description || code);
    this.name = 'OAuthError';
    this.code = code;
    this.status = status;
  }
}

/**
 * The server to talk to: $FORMSPREE_API_URL (for development against a
 * review app), else formspree.io. Trailing slashes are dropped so
 * credentials are keyed consistently.
 */
export const endpoint = (): string =>
  (process.env.FORMSPREE_API_URL || DEFAULT_ENDPOINT).replace(/\/+$/, '');

/**
 * The OAuth client id: $FORMSPREE_CLIENT_ID (review apps get a new id on
 * every redeploy), else the endpoint's built-in id.
 */
export const clientIdFor = (endpoint: string): string | null =>
  process.env.FORMSPREE_CLIENT_ID || CLIENT_IDS[endpoint] || null;

/**
 * POSTs form-encoded params to an OAuth endpoint and resolves with the
 * response, whatever its status.
 */
const post = <T>(
  endpoint: string,
  path: string,
  params: Record<string, string>,
): Promise<AxiosResponse<T | OAuthErrorBody>> =>
  axios.post(`${endpoint}${path}`, new URLSearchParams(params).toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    timeout: REQUEST_TIMEOUT,
    validateStatus: () => true,
  });

/**
 * Turns an error response into an OAuthError. A body that isn't an OAuth
 * error (an HTML page, say) becomes `server_error`, keeping the status.
 */
const errorFrom = (response: AxiosResponse<unknown>): OAuthError => {
  const body = (response.data ?? {}) as OAuthErrorBody;
  return new OAuthError(
    body.error || 'server_error',
    body.error_description,
    response.status,
  );
};

/** Starts a device authorization (RFC 8628 §3.1). */
export const requestDeviceCode = async ({
  endpoint,
  clientId,
  scope,
}: {
  endpoint: string;
  clientId: string;
  scope: string;
}): Promise<DeviceCode> => {
  const response = await post<DeviceCode>(endpoint, '/oauth/device', {
    client_id: clientId,
    scope,
  });

  if (response.status === 429) throw new OAuthError('rate_limited');
  if (response.status !== 200) throw errorFrom(response);
  return response.data as DeviceCode;
};

/**
 * Polls the token endpoint until the device authorization is approved,
 * denied or expired (RFC 8628 §3.4).
 *
 * `expiresIn` is how long to keep polling, in seconds. Running out of it
 * rejects with `expired_token` and no HTTP status: one with a status is
 * the server saying the code itself has expired.
 *
 * With `immediate` the first poll is sent at once, for a login that may
 * already have been approved.
 */
export const pollForToken = async ({
  endpoint,
  clientId,
  deviceCode,
  interval,
  expiresIn,
  immediate = false,
}: {
  endpoint: string;
  clientId: string;
  deviceCode: string;
  interval?: number | undefined;
  expiresIn?: number | undefined;
  immediate?: boolean;
}): Promise<TokenResponse> => {
  // RFC 8628 defaults: poll every 5 seconds; codes last 15 minutes here.
  let wait = (interval || 5) * 1000;
  // Zero is a time too: with `immediate`, one poll and no more.
  const lifetime = (expiresIn ?? 900) * 1000;
  let elapsed = 0;
  let networkFailures = 0;
  let first = immediate;

  for (;;) {
    const pause = first ? 0 : wait;
    first = false;

    // Give up once the code has expired rather than poll a dead code.
    if (elapsed + pause > lifetime) {
      throw new OAuthError('expired_token');
    }

    if (pause) await sleep(pause);
    elapsed += pause;

    let response: AxiosResponse<TokenResponse | OAuthErrorBody>;
    try {
      response = await post<TokenResponse>(endpoint, '/oauth/tokens', {
        grant_type: DEVICE_GRANT,
        device_code: deviceCode,
        client_id: clientId,
      });
    } catch (error) {
      // A dropped connection shouldn't end a login the person may be
      // approving right now; try again at the next interval.
      networkFailures += 1;
      if (networkFailures > MAX_NETWORK_FAILURES) throw error;
      continue;
    }
    networkFailures = 0;

    if (response.status === 200) return response.data as TokenResponse;

    const error = errorFrom(response);

    switch (error.code) {
      case 'authorization_pending':
        break;

      // The server wants every later poll 5 seconds further apart
      // (RFC 8628 §3.5).
      case 'slow_down':
        wait += 5000;
        break;

      default:
        throw error;
    }
  }
};

/**
 * Swaps a refresh token for a new pair. The server rotates on every
 * refresh, so the old refresh token is spent once this resolves.
 */
export const refreshToken = async ({
  endpoint,
  clientId,
  refreshToken,
}: {
  endpoint: string;
  clientId: string;
  refreshToken: string;
}): Promise<TokenResponse> => {
  const response = await post<TokenResponse>(endpoint, '/oauth/tokens', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  if (response.status !== 200) throw errorFrom(response);
  return response.data as TokenResponse;
};

/** Revokes a token and, with it, its whole grant (RFC 7009). */
export const revokeToken = async ({
  endpoint,
  clientId,
  token,
}: {
  endpoint: string;
  clientId: string;
  token: string;
}): Promise<void> => {
  const response = await post<unknown>(endpoint, '/oauth/revoke', {
    token,
    token_type_hint: 'refresh_token',
    client_id: clientId,
  });

  if (response.status !== 200) throw errorFrom(response);
};

/** Turns a token response into the entry the credentials store keeps. */
export const toCredentials = (
  data: TokenResponse,
  clientId: string,
): Credentials => ({
  client_id: clientId,
  access_token: data.access_token,
  refresh_token: data.refresh_token,
  expires_at: Date.now() + data.expires_in * 1000,
  ...(data.scope === undefined ? {} : { scope: data.scope }),
});
