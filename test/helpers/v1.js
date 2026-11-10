const fs = require('fs');
const axios = require('axios');

const ENDPOINT = 'https://formspree.io';

/**
 * Stores a login for formspree.io that hasn't expired.
 */
const login = credentialsFile => {
  fs.writeFileSync(
    credentialsFile,
    JSON.stringify({
      [ENDPOINT]: {
        client_id: 'cli-client',
        access_token: 'fso_access_0',
        refresh_token: 'fso_refresh_0',
        expires_at: Date.now() + 60 * 60 * 1000,
        scope: 'projects:write project.forms:write'
      }
    }),
    { mode: 0o600 }
  );
};

/**
 * Answers every API request with the given response.
 */
const answer = (status, data, headers) => {
  axios.request.mockImplementation(() =>
    Promise.resolve({ status, data, headers: headers || {} })
  );
};

/**
 * The API requests sent so far, without the parts every request shares.
 */
const requests = () =>
  axios.request.mock.calls.map(([config]) => {
    const sent = { method: config.method, url: config.url };
    if (config.params) sent.params = config.params;
    if (config.data) sent.data = config.data;
    return sent;
  });

const headers = (n = 0) => axios.request.mock.calls[n][0].headers;

const problem = (status, detail, extra = {}) => ({
  type: 'https://help.formspree.io/problems/x',
  title: 'A problem',
  status,
  detail,
  category: 'validation',
  retryable: false,
  owner_action_required: false,
  ok: false,
  error: { message: detail, code: 'X' },
  ...extra
});

module.exports = { ENDPOINT, login, answer, requests, headers, problem };
