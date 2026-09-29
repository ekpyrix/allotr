import type { AccountView, ArchiveImpactView, Money } from '@allotr/shared';
import type { Settle } from '@/lib/ledger';

// Which warning the archive dialog shows about today's figure. The amount
// comes from the server, which runs core's daily projection on the ledger
// plus the settling entry; nothing here adds money up.

export type ArchiveWarning =
  | Readonly<{ kind: 'write_off'; drop: Money }>
  | Readonly<{ kind: 'savings'; drop: Money; target: AccountView }>
  | Readonly<{ kind: 'transfer'; drop: Money }>;

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
  if (settle.method === 'write_off') {
    const drop = impact.writeOff.leftTodayDrop;
    return drop.amountMinor > 0 ? { kind: 'write_off', drop } : null;
  }
  const drop = impact.transfers.find(
    (t) => t.toAccountId === settle.toAccountId,
  )?.leftTodayDrop;
  if (drop === undefined || drop.amountMinor <= 0) return null;
  const target = accounts.find((a) => a.id === settle.toAccountId);
  return target !== undefined &&
    account.budgetGroup === 'on' &&
    target.budgetGroup === 'off'
    ? { kind: 'savings', drop, target }
    : { kind: 'transfer', drop };
}
