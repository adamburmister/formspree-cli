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
(or under `$XDG_CONFIG_HOME/formspree`) and refreshes it in the background. If
the login is revoked or expires, run `formspree login` again.

- `formspree whoami` lists the accounts you're logged in to.
- `formspree logout` revokes the login and removes the stored token.

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

## Projects and forms

Once you're logged in (or have an API key set), you can manage projects and
forms from the command line:

```bash
formspree projects list
formspree projects create "Marketing site"
formspree projects get <project-id>
formspree projects rename <project-id> "Docs site"

formspree forms list --project <project-id>
formspree forms create "Contact" --project <project-id> --email you@example.com --app slack
formspree forms get <form-id>
formspree forms update <form-id> --webhook https://example.com/hook
formspree forms delete <form-id>
```

`forms create` prints the form's endpoint and what's left to do: verify an
email address, or connect an app in the dashboard. Without `--project` the
form lands in the project named by `--project-name` (made if missing), else in
"Default Project".

Flags cover a form's name, key, redirect, reCAPTCHA and its email, webhook and
app actions. For field rules, and anything else a form in `formspree.json` can
hold, pass a JSON file with `--from`, or pipe it in with `--stdin`. Flags win
over the file:

```bash
formspree forms create --from contact.json --project <project-id>
```

```json
{
  "name": "Contact",
  "fields": { "email": { "type": "email", "required": true } },
  "actions": [{ "type": "email", "to": "you@example.com" }]
}
```

`forms update` changes only what you pass. It adds or replaces fields and
actions, by field name and action type; it can't remove one. `forms delete` asks first, or takes
`--yes` where nobody can answer.

To check a submission against a form's rules without sending it, with no login
needed:

```bash
formspree forms validate <form-id> email=ada@example.com message=Hello
```

It exits with 1 when the submission isn't valid.

### In scripts

- `--json` prints the API's response, and nothing else, on stdout. When the API
  refuses a request the response is its error, and the exit code is 1.
- `--idempotency-key <key>` on `projects create` and `forms create` makes a
  retry safe: for 24 hours, the same key with the same options returns the
  first result instead of creating again.

## Releasing

Run the following to publish a new version:

```bash
npm run release
```
