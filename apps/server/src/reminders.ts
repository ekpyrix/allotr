import { randomUUID } from 'node:crypto';
import { dueReminders, type DueReminder } from '@allotr/core';
import {
  formatMoney,
  localDateIn,
  type ReminderListView,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from './db/schema.ts';
import { readLedgerSettings } from './ledger/ledger-settings.ts';
import { loadView } from './ledger/today.ts';
import type { Logger } from './logger.ts';
import { pushToUser, type PushSender } from './push/delivery.ts';

// Reminders (ADR 0024): the scheduler asks the core for what is due today
// for each user, records each reminder once and, for users who opted in on a
// device, pushes it. The wording lives here, in English like the rest of
// what the server says; the web app shows the stored text as it is.

type Texts = Readonly<{ title: string; body: string; url: string }>;

function describe(
  reminder: DueReminder,
  names: ReadonlyMap<string, string>,
  locale: string,
): Texts {
  switch (reminder.kind) {
    case 'bill_due': {
      const name = names.get(reminder.billId) ?? 'A bill';
      return {
        title: `${name} is due ${reminder.dueOn}`,
        body: `${formatMoney(reminder.amount, locale)} is set aside for it. Mark it paid when it goes out.`,
        url: '/budget#bills',
      };
    }
    case 'iou_due':
      return reminder.direction === 'owed-to-me'
        ? {
            title: `${reminder.person} was due to pay you back today`,
            body: `${formatMoney(reminder.outstanding, locale)} is still owed.`,
            url: '/budget#ious',
          }
        : {
            title: `You were due to pay ${reminder.person} today`,
            body: `${formatMoney(reminder.outstanding, locale)} is still owed.`,
            url: '/budget#ious',
          };
    case 'iou_overdue':
      return reminder.direction === 'owed-to-me'
        ? {
            title: `${reminder.person} is ${String(reminder.daysOverdue)} days late`,
            body: `${formatMoney(reminder.outstanding, locale)} is still owed to you.`,
            url: '/budget#ious',
          }
        : {
            title: `You are ${String(reminder.daysOverdue)} days late paying ${reminder.person}`,
            body: `${formatMoney(reminder.outstanding, locale)} is still owed.`,
            url: '/budget#ious',
          };
    case 'weekly_review':
      return {
        title: 'Your week is ready',
        body: 'See what you spent and how the budgets stand.',
        url: '/',
      };
  }
}

export type RunSummary = Readonly<{ created: number; pushed: number }>;

/** One pass over every user. Safe to run as often as wanted. */
export async function runReminders(
  db: Kysely<DB>,
  send: PushSender,
  now: Date,
  logger?: Logger,
): Promise<RunSummary> {
  const users = await db.selectFrom('users').select('id').execute();
  let created = 0;
  let pushed = 0;
  for (const { id: userId } of users) {
    try {
      const { view, timeZone } = await db
        .transaction()
        .execute((trx) => loadView(trx, userId));
      const { locale } = await readLedgerSettings(db, userId);
      const today = localDateIn(now, timeZone);
      const bills = await db
        .selectFrom('bills')
        .select(['id', 'name'])
        .where('user_id', '=', userId)
        .execute();
      const names = new Map(bills.map((b) => [b.id, b.name]));
      for (const reminder of dueReminders(view, today)) {
        const texts = describe(reminder, names, locale);
        const inserted = await db
          .insertInto('reminders')
          .values({
            id: randomUUID(),
            user_id: userId,
            kind: reminder.kind,
            dedupe_key: reminder.key,
            title: texts.title,
            body: texts.body,
            url: texts.url,
            created_at: now.toISOString(),
          })
          .onConflict((oc) => oc.columns(['user_id', 'dedupe_key']).doNothing())
          .executeTakeFirst();
        if (inserted.numInsertedOrUpdatedRows === 0n) continue;
        created += 1;
        const delivery = await pushToUser(db, send, userId, texts, logger);
        pushed += delivery.sent;
      }
    } catch (error) {
      // One user's problem must not stop the others' reminders.
      logger?.error({ err: error, userId }, 'reminders failed for a user');
    }
  }
  return { created, pushed };
}

export async function listReminders(
  db: Kysely<DB>,
  userId: string,
): Promise<ReminderListView> {
  const rows = await db
    .selectFrom('reminders')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(50)
    .execute();
  const unread = await db
    .selectFrom('reminders')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('user_id', '=', userId)
    .where('read_at', 'is', null)
    .executeTakeFirstOrThrow();
  return {
    reminders: rows.map((row) => ({
      id: row.id,
      kind: row.kind as ReminderListView['reminders'][number]['kind'],
      title: row.title,
      body: row.body,
      url: row.url,
      createdAt: row.created_at,
      readAt: row.read_at,
    })),
    unread: unread.count,
  };
}

export async function markRead(
  db: Kysely<DB>,
  userId: string,
  ids: readonly string[] | undefined,
  now: Date,
): Promise<void> {
  let query = db
    .updateTable('reminders')
    .set({ read_at: now.toISOString() })
    .where('user_id', '=', userId)
    .where('read_at', 'is', null);
  if (ids !== undefined) query = query.where('id', 'in', [...ids]);
  await query.execute();
}
