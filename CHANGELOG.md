# Changelog

## Unreleased

- Add `login` (OAuth device flow), `logout` and `whoami` commands.
- Require Node 24 or later.
- Rewrite the CLI in TypeScript and publish it as ES modules, with every dependency on its current version.
- Show the Formspree banner at the top of `formspree --help` and `formspree login`.
- Accept an account API key with `--key` or `FORMSPREE_API_KEY` in place of a login, for CI.
- Add `projects list`, `get`, `create` and `rename`.
- Add `forms list`, `get`, `create`, `update`, `delete` and `validate`.
- Add `--json` to those commands, and `--idempotency-key` to the two creates.
- `projects create` and `forms create` ask, in a terminal, for the values they weren't given.
- `forms create` prints an HTML snippet for the new form, and a link to more code examples.
- `forms delete` with no form id lists your forms to pick from, in a terminal.
- Add `projects delete`. It deletes the project's forms first, once you agree in a terminal or pass `--yes --forms`, and with no project id it lists your projects to pick from.
- Refuse an option or command the CLI doesn't know, instead of ignoring it.
- Check for updates in the background, at most once a day and only in a terminal, instead of before every command.

## 0.9.0

- Fix option parsing to support dashes (#6)

## 0.8.0

- Automatically install the shim package (if applicable).
- Accept a `--no-shim` argument to skip installing it.

## 0.7.0

- Add special error message for missing Mailchimp audience ID.

## 0.6.0

- Improve helpfulness of error messages.

## 0.5.0

- Add version check.
- Better error messages for missing secrets.
- Update `yargs`.

## 0.4.0

- Move `common-tags` to regular dependencies.

## 0.3.0

- Add `secrets {add|update|delete}` commands.
- Improve some failure states to include more help info.

## 0.2.0

- Add `init` and `forms add` commands.

## 0.1.0

- Initial release.
