# Changelog

## Unreleased

- Add `login` (OAuth device flow), `logout` and `whoami` commands.
- Require Node 10.12 or later.
- Show the Formspree banner at the top of `formspree --help` and `formspree login`.
- Accept an account API key with `--key` or `FORMSPREE_API_KEY` in place of a login, for CI.
- Add `projects list`, `get`, `create` and `rename`.
- Add `forms list`, `get`, `create`, `update`, `delete` and `validate`.
- Add `--json` to those commands, and `--idempotency-key` to the two creates.

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
