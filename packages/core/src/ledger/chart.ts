import type { CurrencyCode } from '@allotr/shared';
import { LedgerError } from './errors.ts';
import type { Account, AccountId, SystemRole } from './types.ts';

/** A user's accounts, including system accounts, by ID. */
export type Chart = ReadonlyMap<AccountId, Account>;

export function chartOf(accounts: Iterable<Account>): Chart {
  return new Map([...accounts].map((account) => [account.id, account]));
}

export function accountIn(chart: Chart, id: AccountId): Account {
  const account = chart.get(id);
  if (account === undefined) {
    throw new LedgerError('ledger.unknown_account', `Unknown account ${id}.`);
  }
  return account;
}

/**
 * The balancing account for a role and currency. The server creates system
 * accounts before it builds a transaction that needs them.
 */
export function systemAccount(
  chart: Chart,
  role: SystemRole,
  currency: CurrencyCode,
): Account {
  for (const account of chart.values()) {
    if (account.systemRole === role && account.currency === currency)
      return account;
  }
  throw new LedgerError(
    'ledger.missing_system_account',
    `There is no ${role} account in ${currency}.`,
  );
}

/** The system accounts a transaction in these currencies may need. */
export function systemAccountsNeeded(
  chart: Chart,
  currencies: Iterable<CurrencyCode>,
): { role: SystemRole; currency: CurrencyCode }[] {
  const roles: SystemRole[] = ['expenses', 'income', 'opening', 'conversion'];
  return [...new Set(currencies)].flatMap((currency) =>
    roles
      .filter(
        (role) =>
          ![...chart.values()].some(
            (a) => a.systemRole === role && a.currency === currency,
          ),
      )
      .map((role) => ({ role, currency })),
  );
}
