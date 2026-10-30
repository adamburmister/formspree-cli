const axios = require('axios');
const version = require('../package.json').version;
const credentials = require('./credentials');
const oauth = require('./oauth');

// Refresh a little early so a token doesn't expire mid-request.
const EXPIRY_MARGIN = 60 * 1000;

/**
 * Thrown when there is no usable token: never logged in, or the grant
 * was revoked or expired. The fix is always `formspree login`.
 */
class LoginRequired extends Error {
  constructor(reason) {
    super(reason || 'Not logged in');
  }
}

/**
 * Sends a v1 API request with the entry's access token.
 */
const send = (endpoint, entry, { method, path }) => {
  return axios.request({
    method,
    url: `${endpoint}${path}`,
    headers: {
      Authorization: `Bearer ${entry.access_token}`,
      'User-Agent': `@formspree/cli@${version}`
    },
    timeout: oauth.REQUEST_TIMEOUT,
    validateStatus: () => true
  });
};

/**
 * Whether the entry's access token has expired, or is about to.
 */
const expired = entry => Date.now() >= entry.expires_at - EXPIRY_MARGIN;

/**
 * Swaps the refresh token for a new pair and stores it, holding the
 * credentials lock throughout. The server rotates on every refresh and
 * revokes the grant if a spent refresh token comes back, so if another
 * process rotated the pair since `stale` was read, this uses its pair
 * rather than spend the old token again.
 */
const refresh = (endpoint, stale) => {
  let revoked = false;

  return credentials
    .update(endpoint, async current => {
      if (!current || current.access_token !== stale.access_token) {
        return current;
      }

      try {
        const data = await oauth.refreshToken({
          endpoint,
          clientId: current.client_id,
          refreshToken: current.refresh_token
        });
        return oauth.toCredentials(data, current.client_id);
      } catch (error) {
        // The grant is gone: revoked, expired, killed by a replayed
        // refresh token, or its client was deleted (a review app
        // redeploy). The stored pair is useless now.
        if (error.code === 'invalid_grant' || error.code === 'invalid_client') {
          revoked = true;
          return null;
        }
        throw error;
      }
    })
    .then(fresh => {
      if (revoked) {
        throw new LoginRequired('Your login has expired or was revoked');
      }
      if (!fresh) throw new LoginRequired();
      return fresh;
    });
};

/**
 * Calls the v1 API with the stored token for an endpoint.
 *
 * @param {string} endpoint
 * @param {{ method: string, path: string }} req
 */
const request = async (endpoint, req) => {
  let entry = credentials.read(endpoint);
  if (!entry) throw new LoginRequired();
  if (expired(entry)) entry = await refresh(endpoint, entry);

  let response = await send(endpoint, entry, req);
  if (response.status !== 401) return response;

  // The token may have been rotated or revoked since it was stored.
  // Refresh once; a second 401 means the grant no longer works.
  entry = await refresh(endpoint, entry);
  response = await send(endpoint, entry, req);
  if (response.status === 401) {
    throw new LoginRequired('Your login was not accepted');
  }
  return response;
};

module.exports = { request, LoginRequired };
