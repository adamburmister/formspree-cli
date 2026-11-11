# Formspree CLI

The command line interface for [Formspree](https://formspree.io).

## Installation

Run the following to install on your machine:

```bash
npm i -g @formspree/cli
```

The CLI needs Node 24 or later.

## Logging in

Run the following to log in through your browser:

```bash
formspree login
```

The CLI prints a link and a code, and opens the link in your browser. Check
the code matches, and approve. Over SSH, or with `--no-browser`, it only
prints the link for you to open. The CLI stores the token in `~/.config/formspree/credentials.json`
(or under `$XDG_CONFIG_HOME/formspree`) and refreshes it in the background. If
the login is revoked or expires, run `formspree login` again.

You don't have to log in first. Run in a terminal, a command that needs a
login and finds none asks whether to log in now, and carries on with what you
asked for once you have. Say no and it stops, as it does off a terminal.

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
formspree projects delete <project-id>

formspree forms list --project <project-id>
formspree forms create "Contact" --project <project-id> --email you@example.com --app slack
formspree forms get <form-id>
formspree forms update <form-id> --webhook https://example.com/hook
formspree forms delete <form-id>
```

Run in a terminal, `projects create` and `forms create` ask for each value
they weren't given. Pick from a list with the arrow keys, tick apps with
space, press Enter to skip a question that's optional, and Ctrl+C to stop
without creating anything. A name, `--project`, `--project-name` or
`--account` on the command line answers its own question, and the rest are
still asked:

```bash
formspree forms create "Contact" --project <project-id>
```

An option that sets the form's contents, like `--email` or `--from`, turns the
questions off: the form is created from the options alone.

`forms create` prints the form's endpoint, an HTML snippet to paste into your
site, a link to more code examples in the dashboard, and what's left to do:
verify an email address, or connect an app. Without `--project` the
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
`--yes` where nobody can answer. Run it without a form id in a
terminal and it lists your forms to pick from.

`projects delete` works the same way, with one difference: Formspree only
deletes a project that has no forms, so the command deletes the project's
forms first. In a terminal it names them and asks once for the lot. With
`--yes` it needs `--forms` as well before it deletes any:

```bash
formspree projects delete <project-id> --yes --forms
```

Without `--forms`, a project that has forms is left as it is. Neither delete
can be undone: a form's submissions go with it, and a project's email
templates, deployment history and the API keys limited to it go with the
project. A key limited to one project can't delete that project.

A deleted form takes the server a moment to remove, and until then its
project can't be deleted. The command waits up to 30 seconds for that. If it's
still not done, nothing is lost: run `projects delete` again.

To go to the dashboard from the command line, `open` opens a page in your
browser:

```bash
formspree open               # the dashboard
formspree open <form-id>     # a form's page
formspree open <project-id>  # a project's page
formspree open docs          # the help site
```

It prints the link as well. With `--url` it prints the link alone and opens
nothing, and it does the same wherever there's no browser to open: over SSH,
or when its output is piped.

To check a submission against a form's rules without sending it, with no login
needed:

```bash
formspree forms validate <form-id> email=ada@example.com message=Hello
```

It exits with 1 when the submission isn't valid.

### In scripts

- The creates only ask questions in a terminal. With piped input, `--json`,
  `--no-interactive` or any option that sets a form's contents, they ask
  nothing and use what they were given.
- `--json` prints the API's response, and nothing else, on stdout. When the API
  refuses a request the response is its error, and the exit code is 1.
- A command never offers to log in with piped input or `--json`. With no
  login it prints how to get one and exits with 1.
- `--idempotency-key <key>` on `projects create` and `forms create` makes a
  retry safe: for 24 hours, the same key with the same options returns the
  first result instead of creating again.

## Development

The CLI is written in TypeScript, in `src/`. Node runs it as it is, so there's
no build step while you work on it:

```bash
npm install
node src/cli.ts --help
```

- `npm test` runs the tests with vitest.
- `npm run typecheck` type-checks the source and the tests.
- `npm run build` compiles `src/` to `dist/`, which is what gets published.
  `npm pack` and `npm publish` run it first.
- `npm run format` formats everything with Prettier.

## Releasing

Run the following to publish a new version:

```bash
npm run release
```
