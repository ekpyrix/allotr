// The Budget screen's pools and bills sub-tabs (docs/ui.md §6). Spread into
// `en` so the other Budget sub-tabs can add their own files.
export const budgetPools = {
  failed: 'Pools could not be loaded.',
  retry: 'Try again',
  empty: 'No pools yet',
  emptyHint: 'Pools group accounts. Add one in Settings.',
  kind: { spending: 'spending', savings: 'savings' },
  dailyLabel: 'Count {name} toward the daily number',
  dailyFixedLabel: '{name} always counts toward the daily number',
  saveFailed: 'Could not change {name}. Try again.',
  balance: 'Balance',
  left: '{left} left of {start}',
  leftLabel: 'Left of {name} this cycle',
  accounts: 'Accounts',
  noAccounts: 'No accounts in this pool.',
  sparkline: '{name} balance, last 30 days',
  savingsNote: 'Savings never count unless you turn that on in Settings.',
  how: {
    title: 'How the daily number works',
    subtitle: 'on-budget money only',
    formula:
      'on-budget {onBudget} − bills {bills} = free {free} ÷ {days} days = {daily}/day',
    body: 'Only pools that count add to the on-budget total. Bills set aside for the cycle come off first, and what is left is shared over the days until payday. Savings are never included.',
  },
} as const;

export const budgetBills = {
  failed: 'Bills could not be loaded.',
  retry: 'Try again',
  timeline: {
    title: 'Bills this cycle',
    subtitle: 'day {day} of {length}',
    label: 'Bills and payday across the cycle',
    payday: 'Payday',
    unknown: 'Bill',
  },
  figures: {
    setAside: 'Set aside',
    paid: 'Paid',
    next: 'Next',
    none: 'none due',
    nextValue: '{name} · {date}',
  },
  upcoming: {
    title: 'Upcoming',
    subtitle: 'unpaid this cycle',
    empty: 'Nothing left to pay',
    emptyHint: 'Every bill due this cycle is paid.',
    due: 'due {date}',
    setAsideOf: '{reserve} set aside of {amount}',
    setAsideLabel: 'Set aside for {name}',
  },
  paid: {
    title: 'Paid this cycle',
    empty: 'Nothing paid yet',
    emptyHint: 'Bills you pay this cycle show up here.',
    on: 'paid {date}',
  },
  later: {
    title: 'Not due this cycle',
    subtitle: 'due again later',
    day: 'day {day}',
  },
} as const;
