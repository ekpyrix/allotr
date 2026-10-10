// The Reports screen's shared pieces: the period menu and the tab stubs
// (docs/ui.md §6). Spread into `en` as `reportsShell`.
export const reportsShell = {
  period: {
    label: 'Period',
    cycle: 'This cycle',
    'last-cycle': 'Last cycle',
    month: 'This month',
    'last-month': 'Last month',
  },
  loadFailed: 'This could not be loaded.',
  retry: 'Try again',
  noCycle: 'There is no cycle before this one yet.',
  stub: 'Coming in this work package.',
} as const;
