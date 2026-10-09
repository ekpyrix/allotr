import {
  addDays,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { accountBalances } from '../ledger/balances.ts';
import type { Transaction } from '../ledger/types.ts';
import { cycleOn, cyclesOf } from './cycles.ts';
import { defaultPoolSetup, poolCounts, poolsOn, type PoolId } from './pools.ts';
import type { LedgerView } from './types.ts';

// Pool figures for the open cycle (docs/domain.md "Pools"): what a counted
// pool's open accounts had to work with this cycle and what they hold now.
// Amounts stay per currency; converting to the default currency is the
// caller's job (ADR 0010). Savings and other pools that do not count get no
// figures, so nothing here can be added to the daily number by accident.

export type PoolCycleFigure = Readonly<{
  /** Per currency, sorted by code; zero sums are left out. */
  start: readonly Money[];
  left: readonly Money[];
}>;

function perCurrency(
  balances: ReadonlyMap<string, Money>,
  ids: readonly string[],
): Money[] {
  const sums = new Map<CurrencyCode, bigint>();
  for (const id of ids) {
    const balance = balances.get(id);
    if (balance === undefined) continue;
    sums.set(
      balance.currency,
      (sums.get(balance.currency) ?? 0n) + BigInt(balance.amountMinor),
    );
  }
  return [...sums]
    .filter(([, sum]) => sum !== 0n)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, sum]) => money(Number(sum), currency));
}

// The entries `start` reads: the ledger as it stood at the end of the day
// before the cycle opened, plus the income recorded since, as the cycle
// allocation's start counts it. An account opened during the cycle brings
// money that was already there, so its opening entry (and any undo of it)
// is moved onto that day, as in the cycle snapshot. An income entry keeps
// its date; an undo of one is income too, so the pair nets to nothing.
function startLedger(
  view: LedgerView,
  openedOn: LocalDate,
  today: LocalDate,
): Transaction[] {
  const day = addDays(openedOn, -1);
  const inCycle = (t: Transaction) =>
    t.occurredOn >= openedOn && t.occurredOn <= today;
  const openings = new Set(
    view.ledger
      .filter((t) => t.kind === 'opening' && inCycle(t))
      .map((t) => t.id),
  );
  const isIncome = (t: Transaction) =>
    t.postings.some(
      (p) => view.chart.get(p.accountId)?.systemRole === 'income',
    );
  return view.ledger.flatMap((t) => {
    if (t.occurredOn < openedOn) return [t];
    if (!inCycle(t)) return [];
    const opens =
      openings.has(t.id) ||
      (t.reversesId !== null && openings.has(t.reversesId));
    if (opens) return [{ ...t, occurredOn: day }];
    return isIncome(t) ? [t] : [];
  });
}

/**
 * For each pool that counts toward the daily number today, what its open
 * accounts had to work with this cycle and what they hold now. `start` is
 * their balance at the end of the day before the cycle opened plus the
 * income they received since, so a paycheck on the opening day is in both
 * figures and spending is what separates them. Both read the same accounts
 * (those in the pool today), so moving an account between pools mid-cycle
 * never looks like spending. `left` exceeds `start` only when money came in
 * from outside the pool another way, such as a transfer from savings or a
 * refund. A back-dated entry or move changes the figures through the same
 * function.
 */
export function poolCycleFigures(
  view: LedgerView,
  today: LocalDate,
): ReadonlyMap<PoolId, PoolCycleFigure> {
  const setup = view.pools ?? defaultPoolSetup;
  const cycle = cycleOn(cyclesOf(view, today), today);
  const startBalances = accountBalances(
    startLedger(view, cycle.openedOn, today),
  );
  const nowBalances = accountBalances(view.ledger, today);
  const members = new Map<PoolId, string[]>();
  for (const [id, pool] of poolsOn(view, today)) {
    if (view.chart.get(id)?.archived === true) continue;
    members.set(pool, [...(members.get(pool) ?? []), id]);
  }
  return new Map(
    setup.pools
      .filter((pool) =>
        poolCounts(pool, view.settings.countSavingsInDaily === true),
      )
      .map((pool) => {
        const ids = members.get(pool.id) ?? [];
        return [
          pool.id,
          {
            start: perCurrency(startBalances, ids),
            left: perCurrency(nowBalances, ids),
          },
        ] as const;
      }),
  );
}
