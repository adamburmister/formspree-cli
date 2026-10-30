const axios = require('axios');
const { URLSearchParams } = require('url');
const env = require('process').env;
const version = require('../package.json').version;

const DEFAULT_ENDPOINT = 'https://formspree.io';
const DEFAULT_SCOPE =
  'projects:write project.forms:write submissions:write keys:write';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

// Keep well under the credentials lock's stale timeout, so a hung refresh
// fails before another process decides the lock is abandoned.
const REQUEST_TIMEOUT = 15 * 1000;
// Consecutive network errors to ride out while polling.
const MAX_NETWORK_FAILURES = 3;

// The public "Formspree CLI" OAuth client's id on each endpoint.
// TODO: production has no "Formspree CLI" client yet. Fill in its id once
// it exists; until then, set FORMSPREE_CLIENT_ID or pass --client-id.
const CLIENT_IDS = {
  'https://formspree.io': null
};

class OAuthError extends Error {
  constructor(code, description) {
    super(description || code);
    this.code = code;
  }
}

/**
 * Picks the endpoint: the --endpoint flag, then $FORMSPREE_API_URL, then
 * formspree.io. Trailing slashes are dropped so credentials are keyed
 * consistently.
 *
 * @param {string} [endpoint]
 */
const normalizeEndpoint = endpoint => {
  return (endpoint || env.FORMSPREE_API_URL || DEFAULT_ENDPOINT).replace(
    /\/+$/,
    ''
  );
};

/**
 * Picks the OAuth client id: the flag, then $FORMSPREE_CLIENT_ID, then the
 * endpoint's built-in id. Review apps get a new id on every redeploy, so
 * they always need the override.
 *
 * @param {string} endpoint
 * @param {string} [override]
 */
const clientIdFor = (endpoint, override) => {
  return override || env.FORMSPREE_CLIENT_ID || CLIENT_IDS[endpoint] || null;
};

/**
 * Waits for the given number of milliseconds.
 *
 * @param {number} ms
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * POSTs form-encoded params to an OAuth endpoint and resolves with the
 * response, whatever its status.
 */
const post = (endpoint, path, params) => {
  return axios.post(
    `${endpoint}${path}`,
    new URLSearchParams(params).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': `@formspree/cli@${version}`
      },
      timeout: REQUEST_TIMEOUT,
      validateStatus: () => true
    }
  );
};

/**
 * Turns an OAuth error response into an OAuthError.
 */
const errorFrom = response => {
  const data = response.data || {};
  return new OAuthError(data.error || 'server_error', data.error_description);
};

/**
 * Starts a device authorization (RFC 8628 §3.1).
 */
const requestDeviceCode = async ({ endpoint, clientId, scope }) => {
  const response = await post(endpoint, '/oauth/device', {
    client_id: clientId,
    scope
  });

  if (response.status === 429) throw new OAuthError('rate_limited');
  if (response.status !== 200) throw errorFrom(response);
  return response.data;
};

/**
 * Polls the token endpoint until the device authorization is approved,
 * denied or expired (RFC 8628 §3.4).
 */
const pollForToken = async ({
  endpoint,
  clientId,
  deviceCode,
  interval,
  expiresIn
}) => {
  // RFC 8628 defaults: poll every 5 seconds; codes last 15 minutes here.
  let wait = (interval || 5) * 1000;
  const lifetime = (expiresIn || 900) * 1000;
  let elapsed = 0;
  let networkFailures = 0;

  for (;;) {
    // Give up once the code has expired rather than poll a dead code.
    if (elapsed + wait > lifetime) {
      throw new OAuthError('expired_token');
    }

    await exports.sleep(wait);
    elapsed += wait;

    let response;
    try {
      response = await post(endpoint, '/oauth/tokens', {
        grant_type: DEVICE_GRANT,
        device_code: deviceCode,
        client_id: clientId
      });
    } catch (err) {
      // A dropped connection shouldn't end a login the person may be
      // approving right now; try again at the next interval.
      networkFailures += 1;
      if (networkFailures > MAX_NETWORK_FAILURES) throw err;
      continue;
    }
    networkFailures = 0;

    if (response.status === 200) return response.data;

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
const refreshToken = async ({ endpoint, clientId, refreshToken }) => {
  const response = await post(endpoint, '/oauth/tokens', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });

  if (response.status !== 200) throw errorFrom(response);
  return response.data;
};

/**
 * Revokes a token and, with it, its whole grant (RFC 7009).
 */
const revokeToken = async ({ endpoint, clientId, token }) => {
  const response = await post(endpoint, '/oauth/revoke', {
    token,
    token_type_hint: 'refresh_token',
    client_id: clientId
  });

  if (response.status !== 200) throw errorFrom(response);
};

/**
 * Turns a token response into the entry the credentials store keeps.
 */
const toCredentials = (data, clientId) => ({
  client_id: clientId,
  access_token: data.access_token,
  refresh_token: data.refresh_token,
  expires_at: Date.now() + data.expires_in * 1000,
  scope: data.scope
});

exports.DEFAULT_ENDPOINT = DEFAULT_ENDPOINT;
exports.DEFAULT_SCOPE = DEFAULT_SCOPE;
exports.REQUEST_TIMEOUT = REQUEST_TIMEOUT;
exports.OAuthError = OAuthError;
exports.normalizeEndpoint = normalizeEndpoint;
exports.clientIdFor = clientIdFor;
exports.sleep = sleep;
exports.requestDeviceCode = requestDeviceCode;
exports.pollForToken = pollForToken;
exports.refreshToken = refreshToken;
exports.revokeToken = revokeToken;
exports.toCredentials = toCredentials;
