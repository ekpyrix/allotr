import type { AccountView, ArchiveImpactView, Money } from '@allotr/shared';
import type { Settle } from '@/lib/ledger';

// Which warning the archive dialog shows about today's figure. The amount
// comes from the server, which runs core's daily projection on the ledger
// plus the settling entry; nothing here adds money up.

/** Left today now and once the entry is recorded, both from the server. */
type Figures = Readonly<{ drop: Money; before: Money; after: Money }>;

export type ArchiveWarning =
  | (Figures & Readonly<{ kind: 'write_off' }>)
  | (Figures & Readonly<{ kind: 'savings'; target: AccountView }>)
  | (Figures & Readonly<{ kind: 'transfer' }>);

/**
 * The warning for the chosen way of clearing the balance, or null when it
 * does not lower today's figure. A transfer from an on-budget account to an
 * off-budget one reads as saving, like a budget switch.
 */
export function archiveWarning(
  impact: ArchiveImpactView,
  account: AccountView,
  settle: Settle | undefined,
  accounts: readonly AccountView[],
): ArchiveWarning | null {
  if (settle === undefined) return null;
  const before = impact.leftToday;
  if (settle.method === 'write_off') {
    const { leftTodayDrop: drop, leftTodayAfter: after } = impact.writeOff;
    return drop.amountMinor > 0
      ? { kind: 'write_off', drop, before, after }
      : null;
  }
  const option = impact.transfers.find(
    (t) => t.toAccountId === settle.toAccountId,
  );
  if (option === undefined || option.leftTodayDrop.amountMinor <= 0)
    return null;
  const figures = {
    drop: option.leftTodayDrop,
    before,
    after: option.leftTodayAfter,
  };
  const target = accounts.find((a) => a.id === settle.toAccountId);
  return target !== undefined &&
    account.budgetGroup === 'on' &&
    target.budgetGroup === 'off'
    ? { kind: 'savings', ...figures, target }
    : { kind: 'transfer', ...figures };
}
