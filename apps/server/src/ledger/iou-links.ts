import { RequestProblem } from '../http/domain-errors.ts';
import type { Db } from './store.ts';

// What ties an entry to IOU rows (ADR 0024), kept apart from the IOU module
// so that recording entries can check it without importing it.

/**
 * An entry that lent, borrowed or settled something is tied to IOU rows, so
 * it cannot be edited or restored as a plain entry (record a new one), and
 * an origin cannot be undone while a live payment still settles it.
 */
export async function iouLinks(
  db: Db,
  userId: string,
  transactionIdValue: string,
): Promise<{ origin: boolean; settles: boolean; liveSettlements: number }> {
  const [origin, settles, live] = await Promise.all([
    db
      .selectFrom('ious')
      .select('id')
      .where('user_id', '=', userId)
      .where('origin_transaction_id', '=', transactionIdValue)
      .executeTakeFirst(),
    db
      .selectFrom('iou_settlements')
      .select('id')
      .where('user_id', '=', userId)
      .where('transaction_id', '=', transactionIdValue)
      .executeTakeFirst(),
    db
      .selectFrom('iou_settlements as s')
      .innerJoin('ious as i', (join) =>
        join
          .onRef('i.id', '=', 's.iou_id')
          .onRef('i.user_id', '=', 's.user_id'),
      )
      .leftJoin('transactions as r', (join) =>
        join
          .onRef('r.reverses_id', '=', 's.transaction_id')
          .onRef('r.user_id', '=', 's.user_id'),
      )
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('i.user_id', '=', userId)
      .where('i.origin_transaction_id', '=', transactionIdValue)
      .where('r.id', 'is', null)
      .executeTakeFirstOrThrow(),
  ]);
  return {
    origin: origin !== undefined,
    settles: settles !== undefined,
    liveSettlements: live.n,
  };
}

export async function refuseIouEdit(
  db: Db,
  userId: string,
  id: string,
  what: 'edit' | 'restore',
): Promise<void> {
  const links = await iouLinks(db, userId, id);
  if (links.origin || links.settles) {
    throw new RequestProblem(
      409,
      'iou_entry',
      `An entry that lends, borrows or settles an IOU cannot be ${what === 'edit' ? 'edited' : 'restored'}. Undo it and record a new one.`,
    );
  }
}

export async function refuseUndoWithPayments(
  db: Db,
  userId: string,
  id: string,
): Promise<void> {
  const links = await iouLinks(db, userId, id);
  if (links.origin && links.liveSettlements > 0) {
    throw new RequestProblem(
      409,
      'iou_has_payments',
      'Undo the payments that settle this IOU first.',
    );
  }
}
