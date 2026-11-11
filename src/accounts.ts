import type { Prompts } from './prompt.ts';
import type { Account } from './types.ts';

/** An account's name, as the lists show it. */
export const name = (account: Account): string =>
  account.name || 'Personal account';

/**
 * Asks which account a create lands on. A create has to name one when the
 * login or key covers several, so there's no skipping it. Resolves with
 * the account's id.
 */
export const pick = (
  p: Prompts,
  accounts: readonly Account[],
): Promise<string> =>
  p.select({
    message: 'Account',
    options: accounts.map((account) => ({
      value: account.id,
      label: name(account),
      hint: `${account.kind}, ${account.id}`,
    })),
  });
