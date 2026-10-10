import type { AccountView, Money, PoolView } from '@allotr/shared';
import { barFraction } from '@/shell/summary-math';

// View model for the Budget · pools sub-tab. Every figure is the server's;
// this only groups accounts under their pool and sizes the "left of" bar.

export type PoolTile = Readonly<{
  id: string;
  name: string;
  kind: PoolView['kind'];
  balance: Money;
  /** The pool's own daily switch. */
  checked: boolean;
  /** The Budget pool always counts; the server refuses to switch it off. */
  fixed: boolean;
  accounts: readonly AccountView[];
  /** On-budget pools only; the bar is full when `left` passes `start`. */
  cycle: Readonly<{ start: Money; left: Money; fraction: number }> | null;
}>;

export function poolTiles(
  pools: readonly PoolView[],
  accounts: readonly AccountView[],
): PoolTile[] {
  return pools
    .filter((pool) => !pool.archived)
    .map((pool) => ({
      id: pool.id,
      name: pool.name,
      kind: pool.kind,
      balance: pool.balance.amount,
      checked: pool.countsTowardDaily,
      fixed: pool.defaultFor === 'on',
      accounts: accounts.filter(
        (account) => !account.archived && account.poolId === pool.id,
      ),
      cycle:
        pool.cycle === null
          ? null
          : {
              start: pool.cycle.start.amount,
              left: pool.cycle.left.amount,
              fraction: barFraction(
                pool.cycle.left.amount.amountMinor,
                pool.cycle.start.amount.amountMinor,
              ),
            },
    }));
}
