import { cyclesOf, topPayees } from '@allotr/core';
import {
  addDays,
  lastDayOfMonth,
  localDate,
  localDateIn,
  type LocalDate,
  type PayeeReportView,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { loadView } from './today.ts';

// Top payees for a payday cycle or a calendar month, computed from the
// ledger on each read. The period is resolved as in the category report.

type Query = Readonly<{
  period: 'cycle' | 'month';
  cycle?: LocalDate | undefined;
  month?: string | undefined;
  limit: number;
}>;

export async function payeeReport(
  db: Kysely<DB>,
  userId: string,
  query: Query,
  now: Date,
): Promise<PayeeReportView> {
  const loaded = await db.transaction().execute((trx) => loadView(trx, userId));
  const today = localDateIn(now, loaded.timeZone);
  let from: LocalDate;
  let to: LocalDate;
  if (query.period === 'month') {
    const month = query.month ?? today.slice(0, 7);
    from = localDate(`${month}-01`);
    to = lastDayOfMonth(from);
  } else {
    const cycles = cyclesOf(loaded.view, today);
    const cycle =
      query.cycle === undefined
        ? cycles.at(-1)
        : cycles.find((c) => c.openedOn === query.cycle);
    if (cycle === undefined) {
      throw new RequestProblem(
        404,
        'cycle_not_found',
        `No cycle opened on ${query.cycle ?? 'that day'}.`,
      );
    }
    from = cycle.openedOn;
    to = cycle.closedOn === null ? today : addDays(cycle.closedOn, -1);
  }
  return {
    period: query.period,
    from,
    to,
    currencies: topPayees(loaded.view, { from, to }, query.limit).map((g) => ({
      currency: g.currency,
      total: g.total,
      payees: g.payees.map((p) => ({
        payee: p.payee,
        count: p.count,
        total: p.total,
      })),
      more: g.more,
      unnamed: g.unnamed,
    })),
  };
}
