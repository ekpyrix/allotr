import {
  money,
  type AccountView,
  type ArchiveImpactView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { archiveWarning } from './archive-impact.ts';

// Made-up accounts and figures.

function account(
  id: string,
  budgetGroup: AccountView['budgetGroup'],
  amountMinor: number,
): AccountView {
  return {
    id,
    name: id,
    kind: 'asset',
    currency: 'USD',
    budgetGroup,
    balance: money(amountMinor, 'USD'),
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastReconciledOn: null,
  } as AccountView;
}

const usd = (amountMinor: number) => money(amountMinor, 'USD');
const wallet = account('wallet', 'on', 25_000);
const everyday = account('everyday', 'on', 340_000);
const savings = account('savings', 'off', 100_000);
const accounts = [wallet, everyday, savings];

const impact: ArchiveImpactView = {
  writeOff: { leftTodayDrop: usd(25_000) },
  transfers: [
    { toAccountId: 'everyday', leftTodayDrop: usd(0) },
    { toAccountId: 'savings', leftTodayDrop: usd(1_470) },
  ],
};

describe('archiveWarning', () => {
  it('says a write-off from the budget lowers today’s figure', () => {
    expect(
      archiveWarning(impact, wallet, { method: 'write_off' }, accounts),
    ).toEqual({ kind: 'write_off', drop: usd(25_000) });
  });

  it('says a transfer to savings lowers today’s figure, naming the target', () => {
    expect(
      archiveWarning(
        impact,
        wallet,
        { method: 'transfer', toAccountId: 'savings' },
        accounts,
      ),
    ).toEqual({ kind: 'savings', drop: usd(1_470), target: savings });
  });

  it('says nothing when today’s figure stays or rises', () => {
    expect(
      archiveWarning(
        impact,
        wallet,
        { method: 'transfer', toAccountId: 'everyday' },
        accounts,
      ),
    ).toBeNull();
    const raises: ArchiveImpactView = {
      ...impact,
      writeOff: { leftTodayDrop: usd(-500) },
    };
    expect(
      archiveWarning(raises, wallet, { method: 'write_off' }, accounts),
    ).toBeNull();
    expect(archiveWarning(impact, wallet, undefined, accounts)).toBeNull();
  });

  it('uses the plain wording when the drop is not saving', () => {
    // Paying off an off-budget debt from the budget lowers today's figure.
    const loan = account('loan', 'off', -30_000);
    const fromBudget: ArchiveImpactView = {
      writeOff: { leftTodayDrop: usd(0) },
      transfers: [{ toAccountId: 'everyday', leftTodayDrop: usd(1_764) }],
    };
    expect(
      archiveWarning(
        fromBudget,
        loan,
        { method: 'transfer', toAccountId: 'everyday' },
        [...accounts, loan],
      ),
    ).toEqual({ kind: 'transfer', drop: usd(1_764) });
  });
});
