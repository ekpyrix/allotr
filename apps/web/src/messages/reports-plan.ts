// The Reports screen's plan and cycles tabs (docs/ui.md §6). Spread into
// `en` as `reportsPlan`.
export const reportsPlan = {
  loadFailed: 'This could not be loaded.',
  retry: 'Try again',
  budget: {
    title: 'Budget against actual',
    subtitle: 'this period',
    barLabel: '{name} spent',
    spent: 'spent',
    planned: 'planned',
    emptyTitle: 'No budgets yet',
    emptyHint:
      'Add a budget on the Budget screen to compare it with what you spent.',
  },
  rate: {
    title: 'Savings rate',
    subtitle: 'per cycle',
    summary: 'Savings rate per cycle',
    caption: 'Savings rate per cycle',
    cycle: 'Cycle',
    rate: 'Rate',
    emptyTitle: 'No cycles yet',
    emptyHint: 'Rates appear once a paycheck has opened a cycle.',
    none: '–',
  },
  netWorth: {
    title: 'Net worth',
    subtitle: 'over the period',
    summary: 'Net worth over {days} days, from {start} to {end}',
    caption: 'Net worth by day',
    day: 'Day',
    total: 'Net worth',
    since: 'was {start} on {date}',
    emptyTitle: 'No history yet',
    emptyHint: 'Net worth appears once an account has a balance.',
  },
  cycles: {
    thisCycle: 'This cycle',
    spent: {
      title: 'Spent per cycle',
      subtitle: 'newest cycles',
      summary: 'Spent per cycle',
    },
    saved: {
      title: 'Saved per cycle',
      subtitle: 'change in savings',
      summary: 'Saved per cycle',
    },
    table: {
      title: 'Past cycles',
      subtitle: 'newest first',
      cycle: 'Cycle',
      income: 'Income',
      spent: 'Spent',
      saved: 'Saved',
      rate: 'Rate',
      amended: 'amended',
    },
    emptyTitle: 'No cycles yet',
    emptyHint: 'A cycle opens with your first paycheck.',
  },
} as const;
