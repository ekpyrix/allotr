import type { Transaction } from '@allotr/core';
import {
  addDays,
  money,
  nextDayOfMonth,
  type Bundle,
  type BundleTransaction,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type {
  Snapshot,
  SnapshotCategory,
  SnapshotIou,
} from './export-snapshot.ts';

// The native JSON export (FR-U3): a bundle that `POST /v1/import` takes
// back on an empty ledger. It holds the ledger as it stands: undone entries
// and the entries an edit replaced are left out with their undos, which
// leaves every balance and every day's figure as it was.

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type BundleAccount = Mutable<Bundle['accounts'][number]>;

const maxName = 100;

/** Live entries: not an undo, and not undone. */
export function liveEntries(entries: readonly Transaction[]): Transaction[] {
  const undone = new Set(
    entries.flatMap((t) => (t.reversesId === null ? [] : [t.reversesId])),
  );
  return entries.filter((t) => t.kind !== 'reversal' && !undone.has(t.id));
}

/**
 * Account names as the bundle writes them. Only open account names are
 * unique, so an archived account whose name is taken gets a suffix.
 */
export function bundleAccountNames(
  accounts: Snapshot['accounts'],
): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  const key = (name: string) => name.trim().toLowerCase();
  const ordered = [
    ...accounts.filter((a) => !a.archived),
    ...accounts.filter((a) => a.archived),
  ];
  for (const account of ordered) {
    let name = account.name;
    for (let n = 1; taken.has(key(name)); n += 1) {
      const suffix = n === 1 ? ' (archived)' : ` (archived ${String(n)})`;
      name = `${account.name.slice(0, maxName - suffix.length).trimEnd()}${suffix}`;
    }
    taken.add(key(name));
    names.set(account.id, name);
  }
  return names;
}

// A bundle path separates levels with "/", so a name keeps a lookalike.
function bundleCategoryName(name: string): string {
  return name.replaceAll('/', '∕');
}

/** "Top" or "Top/Child" for a category id, following merges. */
export function categoryPaths(
  categories: readonly SnapshotCategory[],
): (id: string) => string {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const live = (id: string): SnapshotCategory => {
    let category = byId.get(id);
    for (let hops = 0; category?.mergedIntoId != null && hops < 10; hops += 1) {
      category = byId.get(category.mergedIntoId);
    }
    if (category === undefined) throw new Error(`export: no category ${id}`);
    return category;
  };
  return (id) => {
    const category = live(id);
    const parent = category.parentId === null ? null : live(category.parentId);
    const name = bundleCategoryName(category.name);
    return parent === null
      ? name
      : `${bundleCategoryName(parent.name)}/${name}`;
  };
}

function negate(m: Money): Money {
  return money(-m.amountMinor, m.currency);
}

function sum(amounts: readonly Money[]): Money {
  const [first] = amounts;
  if (first === undefined) throw new Error('export: an empty sum');
  return money(
    amounts.reduce((total, m) => total + m.amountMinor, 0),
    first.currency,
  );
}

export function toBundle(snapshot: Snapshot): Bundle {
  const accountNames = bundleAccountNames(snapshot.accounts);
  const accountName = (id: string): string => {
    const name = accountNames.get(id);
    if (name === undefined) throw new Error(`export: no account ${id}`);
    return name;
  };
  const isUser = (id: string) => accountNames.has(id);
  const path = categoryPaths(snapshot.categories);

  const live = liveEntries(snapshot.entries);
  const liveIds = new Set<string>(live.map((t) => t.id));
  // Only entries something links to carry a ref.
  const linked = new Set<string>();
  for (const bill of snapshot.bills) {
    for (const p of bill.payments) {
      if (p.transactionId !== null && liveIds.has(p.transactionId)) {
        linked.add(p.transactionId);
      }
    }
  }
  for (const r of snapshot.reconciliations) {
    if (r.adjustmentId !== null && liveIds.has(r.adjustmentId)) {
      linked.add(r.adjustmentId);
    }
  }

  // IOUs whose entry stands, by the entry that lent or borrowed, and the
  // payments that settle them, by the entry that paid (ADR 0024). Their
  // entries are not plain transfers or expenses, so they are written as the
  // bundle's IOU kinds.
  const iousByOrigin = new Map<string, SnapshotIou[]>();
  const settlements = new Map<
    string,
    { iou: SnapshotIou; kind: 'repayment' | 'write-off'; amount: Money }[]
  >();
  for (const iou of snapshot.ious) {
    if (!liveIds.has(iou.originId)) continue;
    iousByOrigin.set(iou.originId, [
      ...(iousByOrigin.get(iou.originId) ?? []),
      iou,
    ]);
    for (const s of iou.settlements) {
      if (!liveIds.has(s.transactionId)) continue;
      settlements.set(s.transactionId, [
        ...(settlements.get(s.transactionId) ?? []),
        { iou, kind: s.kind, amount: s.amount },
      ]);
    }
  }

  const accounts = new Map<string, BundleAccount>(
    snapshot.accounts.map((a) => [
      a.id,
      {
        name: accountName(a.id),
        kind: a.kind,
        currency: a.currency as BundleAccount['currency'],
        budgetGroup: a.budgetGroup,
        ...(a.archived ? { archived: true } : {}),
      },
    ]),
  );

  const transactions: BundleTransaction[] = [];
  for (const entry of live) {
    const own = entry.postings.filter((p) => isUser(p.accountId));
    const common = {
      ...(linked.has(entry.id) ? { ref: entry.id } : {}),
      occurredOn: entry.occurredOn,
      ...(entry.note === null ? {} : { note: entry.note }),
      ...tagsOf(snapshot, entry.id),
    };
    const lent = iousByOrigin.get(entry.id);
    const settled = settlements.get(entry.id);
    const [first] = lent ?? [];
    if (lent !== undefined && first !== undefined) {
      const [leg] = own;
      if (leg === undefined) continue;
      const share = entry.postings.find(
        (p) =>
          snapshot.systemRoles.get(p.accountId) === 'expenses' &&
          p.categoryId !== null,
      );
      transactions.push({
        kind: 'iou',
        direction: first.direction,
        account: accountName(leg.accountId),
        people: lent.map((iou) => ({
          ref: iou.id,
          person: iou.person,
          amount: iou.amount,
          ...(iou.dueOn === null ? {} : { dueOn: iou.dueOn }),
        })),
        ...(share === undefined || share.categoryId === null
          ? {}
          : {
              ownShare: {
                amount: share.amount,
                category: path(share.categoryId),
              },
            }),
        ...common,
      });
      continue;
    }
    if (settled !== undefined) {
      const [leg] = own;
      const [line] = settled;
      if (line === undefined) continue;
      if (line.kind === 'write-off') {
        if (entry.categoryId === null) continue;
        transactions.push({
          kind: 'iou_write_off',
          iou: line.iou.id,
          category: path(entry.categoryId),
          ...common,
        });
      } else if (leg !== undefined) {
        transactions.push({
          kind: 'iou_payment',
          account: accountName(leg.accountId),
          settles: settled.map((x) => ({ iou: x.iou.id, amount: x.amount })),
          ...common,
        });
      }
      continue;
    }
    switch (entry.kind) {
      case 'opening': {
        const [leg] = own;
        const account =
          leg === undefined ? undefined : accounts.get(leg.accountId);
        if (leg === undefined || account === undefined) break;
        if (account.openingBalance === undefined) {
          account.openingBalance = leg.amount;
          account.openedOn = entry.occurredOn;
        }
        break;
      }
      case 'budget_switch': {
        const change = entry.budgetSwitch;
        const account =
          change === null ? undefined : accounts.get(change.accountId);
        if (change === null || account === undefined) break;
        account.switches = [
          ...(account.switches ?? []),
          { on: entry.occurredOn, budgetGroup: change.budgetGroup },
        ];
        break;
      }
      case 'write_off': {
        const [leg] = own;
        if (leg === undefined) break;
        transactions.push({
          kind: 'write_off',
          account: accountName(leg.accountId),
          balance: negate(leg.amount),
          ...common,
        });
        break;
      }
      case 'transfer': {
        const from = own.find((p) => p.amount.amountMinor < 0);
        const to = own.find((p) => p.amount.amountMinor > 0);
        if (from === undefined || to === undefined) break;
        transactions.push({
          kind: 'transfer',
          from: accountName(from.accountId),
          to: accountName(to.accountId),
          sent: negate(from.amount),
          ...(to.amount.currency === from.amount.currency
            ? {}
            : { received: to.amount }),
          ...(entry.categoryId === null
            ? {}
            : { category: path(entry.categoryId) }),
          ...common,
        });
        break;
      }
      case 'expense':
      case 'income': {
        const [leg] = own;
        if (leg === undefined) break;
        const sign = entry.kind === 'expense' ? negate : (m: Money) => m;
        const lines = entry.postings
          .filter((p) => p.categoryId !== null)
          .map((p) => ({
            categoryId: p.categoryId ?? '',
            amount: sign(negate(p.amount)),
          }));
        const total = sum(lines.map((l) => l.amount));
        transactions.push({
          kind: entry.kind,
          account: accountName(leg.accountId),
          amount: sign(leg.amount),
          ...(entry.categoryId === null
            ? {
                lines: lines.map((l) => ({
                  category: path(l.categoryId),
                  amount: l.amount,
                })),
              }
            : { category: path(entry.categoryId) }),
          ...(total.currency === leg.amount.currency
            ? {}
            : { foreignAmount: total }),
          ...common,
        });
        break;
      }
      case 'reversal':
        break;
    }
  }

  const categories = snapshot.categories
    .filter((c) => c.mergedIntoId === null)
    .map((c) => {
      const parent =
        c.parentId === null
          ? undefined
          : snapshot.categories.find((p) => p.id === c.parentId);
      return {
        name: bundleCategoryName(c.name),
        ...(parent === undefined
          ? { kind: c.kind }
          : { parent: bundleCategoryName(parent.name) }),
        isPaycheck: c.isPaycheck,
        ...(c.colour === null ? {} : { colour: c.colour }),
        ...(c.icon === null ? {} : { icon: c.icon }),
      };
    });

  const bills = snapshot.bills.map((bill) => ({
    name: bill.name,
    account: accountName(bill.accountId),
    amount: bill.amount,
    ...(bill.price === null ? {} : { price: bill.price }),
    ...(bill.categoryId === null ? {} : { category: path(bill.categoryId) }),
    dueDay: bill.dueDay,
    active: bill.active,
    // A payment for a day the bill is no longer due on settles nothing.
    payments: bill.payments
      .filter((p) => isDueOn(p.dueOn, bill.dueDay))
      .map((p) => ({
        dueOn: p.dueOn,
        paidOn: p.paidOn,
        ...(p.transactionId !== null && liveIds.has(p.transactionId)
          ? {
              transaction: p.transactionId,
              ...(p.recorded ? { recorded: true } : {}),
            }
          : {}),
      })),
  }));

  const reconciliations = snapshot.reconciliations.map((r) => ({
    account: accountName(r.accountId),
    on: r.on,
    stated: r.stated,
    computed: r.computed,
    ...(r.adjustmentId !== null && liveIds.has(r.adjustmentId)
      ? { adjustment: r.adjustmentId }
      : {}),
  }));

  const { settings } = snapshot;
  return {
    format: 'allotr.bundle',
    version: 1,
    settings: {
      locale: settings.locale,
      timeZone: settings.timeZone,
      defaultCurrency: settings.defaultCurrency,
      paydayRule: settings.paydayRule,
      paydayDay: settings.paydayDay,
      paydayOverride: settings.paydayOverride,
      iouWriteOffAfterDays: settings.iouWriteOffAfterDays,
    },
    categories,
    accounts: [...accounts.values()],
    rates: [...snapshot.rates].sort(
      (a, b) =>
        a.asOf.localeCompare(b.asOf) ||
        a.base.localeCompare(b.base) ||
        a.quote.localeCompare(b.quote),
    ),
    transactions,
    bills,
    reconciliations,
  };
}

function isDueOn(day: LocalDate, dueDay: number): boolean {
  return nextDayOfMonth(addDays(day, -1), dueDay) === day;
}

function tagsOf(snapshot: Snapshot, id: string): { tags?: string[] } {
  const names = snapshot.tags.get(id);
  return names === undefined || names.length === 0 ? {} : { tags: [...names] };
}
