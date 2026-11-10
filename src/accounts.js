const chalk = require('chalk');

/**
 * An account on one line, as the lists show it.
 */
const line = account => {
  return `${account.name || 'Personal account'} ${chalk.gray(
    `(${account.kind}, ${account.id})`
  )}`;
};

/**
 * Asks which account a create lands on. A create has to name one when the
 * login or key covers several, so this can't be skipped.
 *
 * @returns {Promise<string>} The account's id
 */
const pick = async (form, accounts) => {
  const { item } = await form.choose('Account', accounts, {
    render: line,
    hint: 'Pick a number',
    required: true
  });
  return item.id;
};

module.exports = { line, pick };
