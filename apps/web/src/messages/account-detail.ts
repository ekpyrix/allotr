// The Accounts detail pane and its sheets (docs/ui.md §6). Kept in its own
// file and spread into `en` so the list side can grow its own block. The
// reconcile and archive wording itself stays under `accounts.*`.
export const accountDetail = {
  title: 'Account',
  close: 'Close account',
  failed: 'This account could not be loaded.',
  retry: 'Try again',
  tags: { archived: 'archived' },
  fields: {
    pool: 'Pool',
    type: 'Type',
    counts: 'Counts as',
    currency: 'Currency',
    reconciled: 'Reconciled',
  },
  kinds: {
    asset: 'Asset',
    liability: 'Debt you owe',
    receivable: 'Owed to you',
    payable: 'Owed by you',
  },
  groups: { on: 'On budget', off: 'Off budget' },
  history: {
    title: 'Balance',
    subtitle: 'last {days} days',
    summary: 'Balance of {name}, last {days} days: from {start} to {end}.',
    caption: 'Balance by day',
    day: 'Day',
    balance: 'Balance',
    failed: 'The balance history could not be loaded.',
    empty: 'No history yet.',
  },
  recent: {
    title: 'Recent entries',
    empty: 'No entries in this account yet.',
    failed: 'The entries could not be loaded.',
  },
  actions: {
    reconcile: 'Reconcile',
    transfer: 'Transfer from here',
    archive: 'Archive',
  },
  reconcileSheet: {
    failed: 'Could not compare with the bank. Try again.',
    adjustFailed:
      'Could not adjust. The difference may have changed, so compare again.',
    again: 'Compare again',
  },
  archiveSheet: {
    failed: 'Could not archive this account. Try again.',
    noTargetChosen: 'Choose where to transfer the balance.',
  },
} as const;
