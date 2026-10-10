// The Reports screen's calendar tab (docs/ui.md §6). Spread into `en` as
// `reportsCalendar`.
export const reportsCalendar = {
  title: 'Calendar',
  layers: {
    label: 'Layers',
    heat: 'Spending heat',
    due: 'Bills & dues',
  },
  month: {
    previous: 'Previous month',
    next: 'Next month',
  },
  grid: 'Grid',
  table: 'Table',
  headers: { date: 'Date', spent: 'Spent', due: 'Due' },
  marks: { b: 'bill', i: 'IOU', $: 'payday' },
  failed: 'The calendar could not be loaded.',
  retry: 'Try again',
  day: {
    title: 'Day',
    nothing: 'Nothing on this day',
    nothingHint: 'No entries, bills or dues fall on this day.',
    entry: 'Entry',
    untitled: 'Entry',
    bill: 'Bill',
    billPaid: 'Bill, paid',
    payday: 'Payday',
    paydayName: 'Paycheck expected',
    iouOwedToMe: 'IOU, owed to you',
    iouOwedByMe: 'IOU, you owe',
    open: 'Open {name}',
  },
} as const;
