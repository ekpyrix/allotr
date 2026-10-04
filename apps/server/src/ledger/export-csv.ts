import { moneyToDecimal } from '@allotr/shared';
import { categoryPaths } from './export-bundle.ts';
import type { Snapshot, SystemRole } from './export-snapshot.ts';

// The CSV export (FR-U4): one row per posting, every entry including undos,
// so the file is the append-only ledger as stored. RFC 4180 with CRLF line
// ends; amounts are decimals in the posting's currency.

export const csvHeader = [
  'date',
  'entry_id',
  'kind',
  'account',
  'amount',
  'currency',
  'category',
  'note',
  'tags',
  'reverses_id',
  'recorded_at',
  // Last, so readers of the columns before it keep working.
  'time',
] as const;

export const systemAccountNames: Record<SystemRole, string> = {
  expenses: 'Expenses',
  income: 'Income',
  opening: 'Equity:Opening',
  conversion: 'Equity:Conversion',
  receivables: 'Receivables',
  payables: 'Payables',
};

// A spreadsheet runs a cell that starts with one of these as a formula.
const formulaStart = /^[=+\-@\t\r]/;

/** A text cell, safe to open in a spreadsheet. */
export function textCell(value: string): string {
  return field(formulaStart.test(value) ? `'${value}` : value);
}

function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(snapshot: Snapshot): string {
  const names = new Map(snapshot.accounts.map((a) => [a.id, a.name]));
  const accountName = (id: string): string =>
    names.get(id) ??
    systemAccountNames[snapshot.systemRoles.get(id) ?? 'expenses'];
  const path = categoryPaths(snapshot.categories);
  const lines = [csvHeader.join(',')];
  for (const entry of snapshot.entries) {
    const tags = (snapshot.tags.get(entry.id) ?? []).join(';');
    for (const posting of entry.postings) {
      const category = posting.categoryId ?? entry.categoryId;
      lines.push(
        [
          entry.occurredOn,
          entry.id,
          entry.kind,
          textCell(accountName(posting.accountId)),
          moneyToDecimal(posting.amount),
          posting.amount.currency,
          category === null ? '' : textCell(path(category)),
          entry.note === null ? '' : textCell(entry.note),
          textCell(tags),
          entry.reversesId ?? '',
          entry.createdAt,
          entry.occurredTime ?? '',
        ].join(','),
      );
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}
