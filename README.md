# Formspree CLI

The command line interface for [Formspree](https://formspree.io).

## Installation

Run the following to install on your machine:

```bash
npm i -g @formspree/cli
```

## Logging in

Run the following to log in through your browser:

```bash
formspree login
```

The CLI prints a link and a code. Open the link, check the code matches, and
approve. The CLI stores the token in `~/.config/formspree/credentials.json`
(or `$XDG_CONFIG_HOME/formspree`, or `$FORMSPREE_CONFIG_DIR`) and refreshes it
in the background. If the login is revoked or expires, run `formspree login`
again.

- `formspree whoami` lists the accounts you're logged in to.
- `formspree logout` revokes the login and removes the stored token.

To use another Formspree server, set `FORMSPREE_API_URL` (or pass
`--endpoint`/`-e`, which wins over it). Logging in there also needs its
"Formspree CLI" OAuth client id, from `--client-id` or the
`FORMSPREE_CLIENT_ID` env variable. Both can go in a `.env` file:

```bash
export FORMSPREE_API_URL=https://<review-app>.formspree.io
export FORMSPREE_CLIENT_ID=<client-id>
formspree login
formspree whoami
```

Logins are stored per server, so switching `FORMSPREE_API_URL` switches which
one is used.

### API keys, for CI and scripts

Where nobody can approve a login in a browser, use an account API key
(`fsk_...`) instead. Pass it with `--key` (`-k`) or set `FORMSPREE_API_KEY`;
either one takes the place of the stored login:

```bash
FORMSPREE_API_KEY=<your-api-key> formspree whoami
```

A key is used as it is, with no refresh. If the server rejects it, fix or
replace the key: logging in won't help. A key needs no login, so
`formspree login` doesn't take one, and while `FORMSPREE_API_KEY` is set it's
used instead of any login.

`formspree deploy` uses neither: it still takes a deploy key.

## Releasing

Run the following to publish a new version:

```bash
npm run release
```
