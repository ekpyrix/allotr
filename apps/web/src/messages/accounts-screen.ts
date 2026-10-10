// The Accounts screen (docs/ui.md §6): stats, the pool and account tree and
// the row actions. Kept in its own file and spread into `en`, so the detail
// side (reconcile and archive flows, in `accounts.*`) can grow separately.
export const accountsScreen = {
  title: 'Accounts',
  failed: 'Accounts could not be loaded.',
  retry: 'Try again',
  stats: {
    netWorth: 'Net worth',
    netWorthSub: 'all accounts',
    savings: 'Savings & invest',
    savingsSub: 'off budget, never in today',
    credit: 'Credit owed',
    creditNone: 'none',
    creditMany: {
      one: '{count} account',
      other: '{count} accounts',
    },
    creditNoneSub: 'no credit accounts',
    creditOneSub: 'one credit account',
    creditManySub: 'credit accounts',
    reconcile: 'To reconcile',
    reconcileSub: 'accounts need a look',
    reconcileNone: 'all matched',
    reconcileFigure: {
      one: '{count} account',
      other: '{count} accounts',
    },
  },
  list: {
    title: 'Accounts',
    subtitle: 'by pool',
    credit: 'Credit',
    noPool: 'No pool',
    empty: 'No accounts here',
    emptyHint: 'Accounts you add show up in their pool.',
    fold: 'Show or hide the accounts in {name}',
    notReconciled: 'not yet',
    sparkline: '{name}, balance over 30 days',
    actionsOf: 'Actions for {name}',
  },
  menu: {
    reconcile: 'Reconcile',
    transfer: 'Transfer from here',
    rename: 'Rename',
    move: 'Move to another pool',
    archive: 'Archive',
  },
  detail: {
    title: 'Account',
    close: 'Close account',
    pick: 'Pick an account',
    pickHint: 'Its balance, history and actions show here.',
  },
  rename: {
    title: 'Rename {name}',
    name: 'Name',
    save: 'Save name',
    saving: 'Saving…',
    nameRequired: 'Enter a name.',
    nameLong: 'Use at most 100 characters.',
    failed: 'The name could not be saved. Try again.',
  },
  move: {
    title: 'Move {name}',
    intro:
      'From today the account belongs to the pool you choose. Entries do not change, and earlier days keep their figures.',
    pool: 'Pool',
    choose: 'Choose a pool',
    save: 'Move account',
    saving: 'Moving…',
    failed: 'The account could not be moved. Try again.',
    toOn: 'This moves it on budget: its balance adds to what you can spend.',
    toOff:
      'This moves it off budget: its balance counts as savings and leaves what you can spend.',
    noOther: 'There is no other pool to move it to.',
  },
  cancel: 'Cancel',
} as const;
