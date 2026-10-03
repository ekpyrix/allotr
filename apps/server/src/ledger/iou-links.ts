import { randomUUID } from 'node:crypto';
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
  what: 'edit' | 'restore' = 'edit',
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

/**
 * Brings back the IOU rows of an undone entry for its restored copy. A
 * lend or borrow gets its people again; a repayment or write-off settles the
 * same IOUs by the same amounts, if each is still standing and has that much
 * owing, and otherwise is refused. Nothing committed changes.
 */
export async function restoreIouRows(
  db: Db,
  userId: string,
  originalId: string,
  copyId: string,
  now: Date,
): Promise<void> {
  const at = now.toISOString();
  const origin = await db
    .selectFrom('ious')
    .selectAll()
    .where('user_id', '=', userId)
    .where('origin_transaction_id', '=', originalId)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  if (origin.length > 0) {
    await db
      .insertInto('ious')
      .values(
        origin.map((row) => ({
          ...row,
          id: randomUUID(),
          origin_transaction_id: copyId,
          created_at: at,
          updated_at: at,
        })),
      )
      .execute();
  }
  const settlements = await db
    .selectFrom('iou_settlements')
    .selectAll()
    .where('user_id', '=', userId)
    .where('transaction_id', '=', originalId)
    .execute();
  for (const row of settlements) {
    const iou = await db
      .selectFrom('ious as i')
      .innerJoin('transactions as t', (join) =>
        join
          .onRef('t.id', '=', 'i.origin_transaction_id')
          .onRef('t.user_id', '=', 'i.user_id'),
      )
      .leftJoin('transactions as r', (join) =>
        join
          .onRef('r.reverses_id', '=', 't.id')
          .onRef('r.user_id', '=', 't.user_id'),
      )
      .select(['i.amount_minor', 'r.id as undone'])
      .where('i.user_id', '=', userId)
      .where('i.id', '=', row.iou_id)
      .executeTakeFirst();
    // What other live settlements already took off it.
    const taken = await db
      .selectFrom('iou_settlements as s')
      .leftJoin('transactions as r', (join) =>
        join
          .onRef('r.reverses_id', '=', 's.transaction_id')
          .onRef('r.user_id', '=', 's.user_id'),
      )
      .select((eb) => eb.fn.sum<number>('s.amount_minor').as('n'))
      .where('s.user_id', '=', userId)
      .where('s.iou_id', '=', row.iou_id)
      .where('r.id', 'is', null)
      .executeTakeFirst();
    const left = (iou?.amount_minor ?? 0) - (taken?.n ?? 0);
    if (iou === undefined || iou.undone !== null || row.amount_minor > left) {
      throw new RequestProblem(
        409,
        'iou_changed',
        'The IOU this settled was undone or has been paid since, so this cannot be restored. Record it again.',
      );
    }
    await db
      .insertInto('iou_settlements')
      .values({
        ...row,
        id: randomUUID(),
        transaction_id: copyId,
        created_at: at,
      })
      .execute();
  }
}
