import { commit, negate } from './build.ts';
import type { Chart } from './chart.ts';
import { LedgerError } from './errors.ts';
import type { EntryMeta, Transaction, TransactionId } from './types.ts';

// Undo and edit never change a committed transaction (invariant 2, FR-L4).

export type ReversalMeta = Omit<EntryMeta, 'occurredOn'>;

/**
 * Undoes a transaction with one that negates every posting and references
 * it. The reversal carries the original's date, so figures for every day
 * since then are corrected as well.
 */
export function reverse(
  chart: Chart,
  ledger: readonly Transaction[],
  originalId: TransactionId,
  meta: ReversalMeta,
): Transaction {
  const original = ledger.find((t) => t.id === originalId);
  if (original === undefined) {
    throw new LedgerError(
      'ledger.not_found',
      `Transaction ${originalId} does not exist.`,
    );
  }
  if (original.kind === 'reversal') {
    throw new LedgerError(
      'ledger.reversal_of_reversal',
      'An undo cannot be undone. Record the entry again instead.',
    );
  }
  if (ledger.some((t) => t.reversesId === originalId)) {
    throw new LedgerError(
      'ledger.already_reversed',
      'This entry has already been undone.',
    );
  }

  return commit(chart, {
    meta: { ...meta, occurredOn: original.occurredOn },
    kind: 'reversal',
    categoryId: original.categoryId,
    reversesId: original.id,
    impliedRate: original.impliedRate,
    postings: original.postings.map((posting) => ({
      ...posting,
      amount: negate(posting.amount),
    })),
  });
}

/**
 * An edit is a reversal of the original plus its replacement, built with
 * the same functions as any new entry.
 */
export function edit(
  chart: Chart,
  ledger: readonly Transaction[],
  originalId: TransactionId,
  meta: ReversalMeta,
  replacement: Transaction,
): readonly [Transaction, Transaction] {
  if (replacement.kind === 'reversal') {
    throw new LedgerError(
      'ledger.reversal_of_reversal',
      'An edit cannot replace an entry with an undo.',
    );
  }
  return [reverse(chart, ledger, originalId, meta), replacement];
}

export type ReinstateMeta = Omit<EntryMeta, 'occurredOn' | 'note'>;

/**
 * Brings back an undone entry as a new copy of it: same kind, date,
 * category, note and postings. The original and its undo stay as they
 * are, so nothing committed changes.
 */
export function reinstate(
  chart: Chart,
  ledger: readonly Transaction[],
  originalId: TransactionId,
  meta: ReinstateMeta,
): Transaction {
  const original = ledger.find((t) => t.id === originalId);
  if (original === undefined) {
    throw new LedgerError(
      'ledger.not_found',
      `Transaction ${originalId} does not exist.`,
    );
  }
  if (original.kind === 'reversal') {
    throw new LedgerError(
      'ledger.reversal_of_reversal',
      'An undo cannot be restored. Restore the entry it undid instead.',
    );
  }
  // Switching a group back is a new switch, checked against the group the
  // account is in now.
  if (original.kind === 'budget_switch') {
    throw new LedgerError(
      'ledger.invalid_transaction',
      'A budget switch cannot be restored. Switch the account again instead.',
    );
  }
  if (!ledger.some((t) => t.reversesId === originalId)) {
    throw new LedgerError(
      'ledger.not_undone',
      'Only a deleted entry can be restored.',
    );
  }
  return commit(chart, {
    meta: { ...meta, occurredOn: original.occurredOn, note: original.note },
    kind: original.kind,
    categoryId: original.categoryId,
    impliedRate: original.impliedRate,
    postings: original.postings,
  });
}
