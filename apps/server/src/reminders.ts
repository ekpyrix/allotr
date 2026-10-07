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
import { t } from './messages/t.ts';
import { pushToUser, type PushSender } from './push/delivery.ts';

// Reminders (ADR 0024): the scheduler asks the core for what is due today
// for each user, records each reminder once and, for users who opted in on a
// device, pushes it. The wording comes from the message catalogue in the
// user's locale and is stored as composed; the web app shows it as it is.

type Texts = Readonly<{ title: string; body: string; url: string }>;

function describe(
  reminder: DueReminder,
  names: ReadonlyMap<string, string>,
  locale: string,
): Texts {
  switch (reminder.kind) {
    case 'bill_due': {
      const name =
        names.get(reminder.billId) ?? t(locale, 'reminders.unnamedBill');
      return {
        title: t(locale, 'reminders.billDue.title', {
          name,
          date: reminder.dueOn,
        }),
        body: t(locale, 'reminders.billDue.body', {
          amount: formatMoney(reminder.amount, locale),
        }),
        url: '/budget#bills',
      };
    }
    case 'iou_due': {
      const amount = formatMoney(reminder.outstanding, locale);
      const { person } = reminder;
      return reminder.direction === 'owed-to-me'
        ? {
            title: t(locale, 'reminders.iouDue.owedToMe.title', { person }),
            body: t(locale, 'reminders.iouDue.owedToMe.body', { amount }),
            url: '/budget#ious',
          }
        : {
            title: t(locale, 'reminders.iouDue.owedByMe.title', { person }),
            body: t(locale, 'reminders.iouDue.owedByMe.body', { amount }),
            url: '/budget#ious',
          };
    }
    case 'iou_overdue': {
      const amount = formatMoney(reminder.outstanding, locale);
      const { person, daysOverdue: count } = reminder;
      return reminder.direction === 'owed-to-me'
        ? {
            title: t(locale, 'reminders.iouOverdue.owedToMe.title', {
              person,
              count,
            }),
            body: t(locale, 'reminders.iouOverdue.owedToMe.body', { amount }),
            url: '/budget#ious',
          }
        : {
            title: t(locale, 'reminders.iouOverdue.owedByMe.title', {
              person,
              count,
            }),
            body: t(locale, 'reminders.iouOverdue.owedByMe.body', { amount }),
            url: '/budget#ious',
          };
    }
    case 'weekly_review':
      return {
        title: t(locale, 'reminders.weeklyReview.title'),
        body: t(locale, 'reminders.weeklyReview.body'),
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
