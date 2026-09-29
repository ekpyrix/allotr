import type { AccountView } from '@allotr/shared';

// How the accounts view sorts accounts for display. Balances and totals
// come from the server; nothing here adds money up.

export interface AccountGroups {
  readonly on: readonly AccountView[];
  readonly off: readonly AccountView[];
  readonly archived: readonly AccountView[];
}

/** Open accounts by the group they count toward today, then archived ones. */
export function groupAccounts(accounts: readonly AccountView[]): AccountGroups {
  const open = accounts.filter((a) => !a.archived);
  return {
    on: open.filter((a) => a.budgetGroup === 'on'),
    off: open.filter((a) => a.budgetGroup === 'off'),
    archived: accounts.filter((a) => a.archived),
  };
}

/** Where a balance can be moved before archiving: open, same currency. */
export function transferTargets(
  account: AccountView,
  accounts: readonly AccountView[],
): AccountView[] {
  return accounts.filter(
    (a) =>
      a.id !== account.id && !a.archived && a.currency === account.currency,
  );
}
