import type { Transaction } from '@allotr/core';
import { moneyToDecimal, type LocalDate } from '@allotr/shared';
import { categoryPaths } from './export-bundle.ts';
import type { Snapshot, SnapshotAccount } from './export-snapshot.ts';

// The Beancount export (FR-U4): every entry as recorded, undos included,
// each balancing per currency on its own (conversions go through
// Equity:Conversion, ADR 0010), so no price annotations are needed.
// Account names are made from the user's names, cleaned to what the
// format allows and kept unique.

const roots = {
  asset: 'Assets',
  receivable: 'Assets:Receivable',
  liability: 'Liabilities',
  payable: 'Liabilities:Payable',
} as const satisfies Record<SnapshotAccount['kind'], string>;

/** One account-name component: letters, digits and dashes, capitalised. */
export function component(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (cleaned === '') return 'X';
  const first = cleaned.charAt(0);
  const upper = first.toUpperCase();
  if (upper !== first) return `${upper}${cleaned.slice(1)}`;
  return /[\p{L}\p{N}]/u.test(first) ? cleaned : `X${cleaned}`;
}

function tag(name: string): string {
  return name.replace(/[^A-Za-z0-9\-_/.]+/g, '-');
}

function quoted(text: string): string {
  return `"${text.replace(/\s+/g, ' ').replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

// Unique names: a second "Food & Drink" beside "Food-Drink" gets "-2".
function namer() {
  const used = new Set<string>();
  return (wanted: string): string => {
    let name = wanted;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) {
      name = `${wanted}-${String(n)}`;
    }
    used.add(name.toLowerCase());
    return name;
  };
}

type Names = Readonly<{
  /** By account id, then by category id for Expenses and Income legs. */
  posting: (entry: Transaction, index: number) => string;
  user: ReadonlyMap<string, string>;
}>;

function accountNames(snapshot: Snapshot): Names {
  const unique = namer();
  const user = new Map<string, string>();
  // Open accounts first, so they keep the plain name.
  const ordered = [
    ...snapshot.accounts.filter((a) => !a.archived),
    ...snapshot.accounts.filter((a) => a.archived),
  ];
  for (const account of ordered) {
    user.set(
      account.id,
      unique(`${roots[account.kind]}:${component(account.name)}`),
    );
  }
  const path = categoryPaths(snapshot.categories);
  const byCategory = new Map<string, string>();
  const categoryAccount = (root: string, id: string): string => {
    const key = `${root}/${id}`;
    const known = byCategory.get(key);
    if (known !== undefined) return known;
    const name = unique(
      [root, ...path(id).split('/').map(component)].join(':'),
    );
    byCategory.set(key, name);
    return name;
  };
  const fixed = {
    opening: 'Equity:Opening-Balances',
    conversion: 'Equity:Conversion',
    expenses: 'Expenses:Write-off',
    income: 'Income:Uncategorised',
  } as const;
  for (const name of Object.values(fixed)) unique(name);

  return {
    user,
    posting(entry, index) {
      const posting = entry.postings[index];
      if (posting === undefined) throw new Error('export: no posting');
      const own = user.get(posting.accountId);
      if (own !== undefined) return own;
      const role = snapshot.systemRoles.get(posting.accountId) ?? 'expenses';
      if (role === 'expenses' || role === 'income') {
        const root = role === 'expenses' ? 'Expenses' : 'Income';
        return posting.categoryId === null
          ? fixed[role]
          : categoryAccount(root, posting.categoryId);
      }
      return fixed[role];
    },
  };
}

function narration(entry: Transaction, path: (id: string) => string): string {
  if (entry.note !== null) return entry.note;
  if (entry.categoryId !== null) return path(entry.categoryId);
  return {
    expense: 'Split expense',
    income: 'Split income',
    transfer: 'Transfer',
    opening: 'Opening balance',
    write_off: 'Write-off',
    budget_switch: 'Budget switch',
    reversal: 'Undo',
  }[entry.kind];
}

export function toBeancount(snapshot: Snapshot, today: LocalDate): string {
  const names = accountNames(snapshot);
  const path = categoryPaths(snapshot.categories);

  // Open on the first day an account is used or created; close an
  // archived one on the last day it is used.
  const first = new Map<string, LocalDate>();
  const last = new Map<string, LocalDate>();
  const opened = (name: string, day: LocalDate) => {
    const f = first.get(name);
    if (f === undefined || day < f) first.set(name, day);
  };
  for (const account of snapshot.accounts) {
    opened(names.user.get(account.id) ?? '', account.createdOn);
  }
  for (const entry of snapshot.entries) {
    entry.postings.forEach((_, i) => {
      const name = names.posting(entry, i);
      opened(name, entry.occurredOn);
      const l = last.get(name);
      if (l === undefined || entry.occurredOn > l)
        last.set(name, entry.occurredOn);
    });
  }

  const out: string[] = [
    `; Allotr export of ${today}. Every entry as recorded, undos included.`,
    'option "title" "Allotr"',
    `option "operating_currency" "${snapshot.settings.defaultCurrency}"`,
    '',
  ];

  const currencyOf = new Map(
    snapshot.accounts.map((a) => [names.user.get(a.id), a.currency]),
  );
  for (const [name, day] of [...first].sort(
    (a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]),
  )) {
    const currency = currencyOf.get(name);
    out.push(
      `${day} open ${name}${currency === undefined ? '' : ` ${currency}`}`,
    );
  }
  out.push('');

  for (const rate of [...snapshot.rates].sort(
    (a, b) => a.asOf.localeCompare(b.asOf) || a.base.localeCompare(b.base),
  )) {
    out.push(`${rate.asOf} price ${rate.base} ${rate.rate} ${rate.quote}`);
  }
  if (snapshot.rates.length > 0) out.push('');

  for (const entry of snapshot.entries) {
    if (entry.budgetSwitch !== null) {
      const account = names.user.get(entry.budgetSwitch.accountId);
      if (account !== undefined) {
        out.push(
          `${entry.occurredOn} custom "allotr-budget-group" ${account} "${entry.budgetSwitch.budgetGroup}"`,
          `  id: "${entry.id}"`,
        );
        out.push('');
      }
      continue;
    }
    if (entry.postings.length === 0) continue;
    const tags = (snapshot.tags.get(entry.id) ?? []).map((t) => ` #${tag(t)}`);
    out.push(
      `${entry.occurredOn} * ${quoted(narration(entry, path))}${tags.join('')}`,
      `  id: "${entry.id}"`,
      `  kind: "${entry.kind}"`,
    );
    if (entry.reversesId !== null)
      out.push(`  reverses: "${entry.reversesId}"`);
    if (entry.kind === 'transfer' && entry.categoryId !== null) {
      out.push(`  category: ${quoted(path(entry.categoryId))}`);
    }
    entry.postings.forEach((posting, i) => {
      out.push(
        `  ${names.posting(entry, i)}  ${moneyToDecimal(posting.amount)} ${posting.amount.currency}`,
      );
    });
    out.push('');
  }

  for (const account of snapshot.accounts) {
    if (!account.archived) continue;
    const name = names.user.get(account.id) ?? '';
    out.push(`${last.get(name) ?? account.createdOn} close ${name}`);
  }
  return `${out.join('\n').trimEnd()}\n`;
}
