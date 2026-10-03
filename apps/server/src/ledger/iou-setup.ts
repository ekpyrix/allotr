import { iouId, transactionId, type Iou, type IouSetup } from '@allotr/core';
import { localDate, money } from '@allotr/shared';
import type { Db } from './store.ts';

// IOU rows as core reads them (ADR 0024).

/** Every IOU and settlement as core reads them. */
export async function loadIouSetup(
  db: Db,
  userId: string,
  writeOffAfterDays: number,
): Promise<IouSetup> {
  const [ious, settlements] = await Promise.all([
    db
      .selectFrom('ious as i')
      .innerJoin('transactions as t', (join) =>
        join
          .onRef('t.id', '=', 'i.origin_transaction_id')
          .onRef('t.user_id', '=', 'i.user_id'),
      )
      .select([
        'i.id',
        'i.direction',
        'i.person',
        'i.amount_minor',
        'i.currency',
        'i.origin_transaction_id',
        'i.due_on',
        't.occurred_on as recorded_on',
      ])
      .where('i.user_id', '=', userId)
      .orderBy('i.created_at')
      .orderBy('i.id')
      .execute(),
    db
      .selectFrom('iou_settlements as s')
      .innerJoin('transactions as t', (join) =>
        join
          .onRef('t.id', '=', 's.transaction_id')
          .onRef('t.user_id', '=', 's.user_id'),
      )
      .select([
        's.id',
        's.iou_id',
        's.transaction_id',
        's.kind',
        's.amount_minor',
        's.currency',
        't.occurred_on',
        't.created_at',
      ])
      .where('s.user_id', '=', userId)
      .orderBy('s.created_at')
      .orderBy('s.id')
      .execute(),
  ]);
  const settled = new Map<string, Iou['settlements'][number][]>();
  for (const row of settlements) {
    const list = settled.get(row.iou_id) ?? [];
    list.push({
      id: row.id,
      transactionId: transactionId(row.transaction_id),
      kind: row.kind === 'write-off' ? 'write-off' : 'repayment',
      amount: money(row.amount_minor, row.currency),
      on: localDate(row.occurred_on),
      at: row.created_at,
    });
    settled.set(row.iou_id, list);
  }
  return {
    writeOffAfterDays,
    ious: ious.map((row): Iou => ({
      id: iouId(row.id),
      direction: row.direction === 'owed-by-me' ? 'owed-by-me' : 'owed-to-me',
      person: row.person,
      amount: money(row.amount_minor, row.currency),
      originId: transactionId(row.origin_transaction_id),
      recordedOn: localDate(row.recorded_on),
      dueOn: row.due_on === null ? null : localDate(row.due_on),
      settlements: settled.get(row.id) ?? [],
    })),
  };
}
