const fs = require('fs');
const os = require('os');
const path = require('path');
const { URLSearchParams } = require('url');

/**
 * Points the credentials store at a fresh temporary directory.
 * Returns the path of the credentials file inside it.
 */
const useTempConfigDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'formspree-cli-'));
  process.env.FORMSPREE_CONFIG_DIR = dir;
  return path.join(dir, 'credentials.json');
};

/**
 * Turns a mocked axios call into { url, params, headers }.
 */
const parseCall = ([url, body, config]) => ({
  url,
  params: body ? Object.fromEntries(new URLSearchParams(body)) : {},
  headers: (config && config.headers) || {}
});

const response = (status, data) => Promise.resolve({ status, data });

const oauthError = (error, status = 400) =>
  response(status, { error, error_description: `${error} description` });

const tokenResponse = (suffix = '1', extra = {}) =>
  response(200, {
    access_token: `fso_access_${suffix}`,
    refresh_token: `fso_refresh_${suffix}`,
    token_type: 'Bearer',
    expires_in: 2592000,
    scope: 'projects:write',
    accounts: [{ id: 1, name: 'Personal', kind: 'personal' }],
    ...extra
  });

const deviceResponse = (extra = {}) =>
  response(200, {
    device_code: 'the-device-code',
    user_code: 'WDJB-MJHT',
    verification_uri: 'https://formspree.io/device',
    verification_uri_complete:
      'https://formspree.io/device?user_code=WDJB-MJHT',
    expires_in: 900,
    interval: 5,
    ...extra
  });

/**
 * Strips ANSI color codes so assertions don't depend on the terminal.
 */
const output = spy =>
  spy.mock.calls
    .map(args => args.join(' '))
    .join('\n')
    .replace(/\u001b\[[0-9;]*m/g, '');

module.exports = {
  useTempConfigDir,
  parseCall,
  response,
  oauthError,
  tokenResponse,
  deviceResponse,
  output
};
