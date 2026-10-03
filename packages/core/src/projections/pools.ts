import type { LocalDate } from '@allotr/shared';
import { activeSwitches } from '../ledger/balances.ts';
import type { AccountId, BudgetGroup } from '../ledger/types.ts';
import type { Chart } from '../ledger/chart.ts';
import type { Transaction } from '../ledger/types.ts';

/** What the pool functions read: any `LedgerView` fits. */
export type PoolInputs = Readonly<{
  chart: Chart;
  ledger: readonly Transaction[];
  pools?: PoolSetup | undefined;
  settings: Readonly<{ countSavingsInDaily?: boolean | undefined }>;
}>;

// Pools (ADR 0021, docs/domain.md "Pools"): named groups of accounts, each
// with a switch for whether it counts toward the daily number. An account is
// in exactly one pool on any day. The default pools, Budget and Savings,
// follow the on/off-budget switches in the ledger; a move into another pool
// is a dated row. Both are folded in one timeline, so the latest change on or
// before a day decides, and a back-dated change corrects past days too.

declare const brand: unique symbol;
export type PoolId = string & { readonly [brand]: 'PoolId' };
export const poolId = (id: string) => id as PoolId;

export type PoolKind = 'spending' | 'savings';

export type Pool = Readonly<{
  id: PoolId;
  name: string;
  kind: PoolKind;
  /** The pool's own switch. A savings pool also needs the user's setting. */
  countsTowardDaily: boolean;
}>;

/** An account joining a pool from a day. Never updated, only added to. */
export type PoolMove = Readonly<{
  id: string;
  accountId: AccountId;
  poolId: PoolId;
  effectiveOn: LocalDate;
  /** ISO 8601 UTC instant; orders moves made on the same day. */
  createdAt: string;
}>;

export type PoolSetup = Readonly<{
  /** Every pool, archived ones too, so history keeps its meaning. */
  pools: readonly Pool[];
  /** The pools that on-budget and off-budget switches move accounts into. */
  defaults: Readonly<Record<BudgetGroup, PoolId>>;
  moves: readonly PoolMove[];
}>;

const budgetPool = poolId('budget');
const savingsPool = poolId('savings');

/** The two default pools, used when a view carries no pools of its own. */
export const defaultPoolSetup: PoolSetup = {
  pools: [
    {
      id: budgetPool,
      name: 'Budget',
      kind: 'spending',
      countsTowardDaily: true,
    },
    {
      id: savingsPool,
      name: 'Savings',
      kind: 'savings',
      countsTowardDaily: false,
    },
  ],
  defaults: { on: budgetPool, off: savingsPool },
  moves: [],
};

/**
 * Whether a pool's accounts count toward the daily number. A savings pool
 * needs both its own switch and the setting, so savings are never counted by
 * accident.
 */
export function poolCounts(pool: Pool, countSavingsInDaily: boolean): boolean {
  return (
    pool.countsTowardDaily && (pool.kind === 'spending' || countSavingsInDaily)
  );
}

type Change = Readonly<{
  accountId: AccountId;
  poolId: PoolId;
  on: LocalDate;
  at: string;
  id: string;
}>;

function setupOf(view: PoolInputs): PoolSetup {
  return view.pools ?? defaultPoolSetup;
}

/** Every user account's pool at the end of `date`. */
export function poolsOn(
  view: PoolInputs,
  date: LocalDate,
): Map<AccountId, PoolId> {
  const setup = setupOf(view);
  const changes: Change[] = [
    ...activeSwitches(view.ledger).flatMap((t) =>
      t.budgetSwitch === null
        ? []
        : [
            {
              accountId: t.budgetSwitch.accountId,
              poolId: setup.defaults[t.budgetSwitch.budgetGroup],
              on: t.occurredOn,
              at: t.createdAt,
              id: t.id,
            },
          ],
    ),
    ...setup.moves.map((m) => ({
      accountId: m.accountId,
      poolId: m.poolId,
      on: m.effectiveOn,
      at: m.createdAt,
      id: m.id,
    })),
  ]
    .filter((change) => change.on <= date)
    .sort(
      (a, b) =>
        a.on.localeCompare(b.on) ||
        a.at.localeCompare(b.at) ||
        a.id.localeCompare(b.id),
    );
  const pools = new Map<AccountId, PoolId>();
  for (const account of view.chart.values()) {
    if (account.budgetGroup !== null) {
      pools.set(account.id, setup.defaults[account.budgetGroup]);
    }
  }
  for (const change of changes) {
    if (pools.has(change.accountId)) pools.set(change.accountId, change.poolId);
  }
  return pools;
}

/**
 * Each user account's budget group at the end of `date`: `on` when its pool
 * counts toward the daily number, `off` otherwise (an unknown pool never
 * counts). This is what the daily figures read.
 */
export function groupsOn(
  view: PoolInputs,
  date: LocalDate,
): Map<AccountId, BudgetGroup> {
  const setup = setupOf(view);
  const counts = new Map(
    setup.pools.map((pool) => [
      pool.id,
      poolCounts(pool, view.settings.countSavingsInDaily === true),
    ]),
  );
  return new Map(
    [...poolsOn(view, date)].map(([id, pool]) => [
      id,
      counts.get(pool) === true ? 'on' : 'off',
    ]),
  );
}
