import { addDays, type LocalDate } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId } from 'react';
import { formatDay } from '@/features/today/format';
import { calendarQuery } from '@/lib/ledger';
import { billsQuery } from '@/lib/settings';
import { t } from '@/messages/t';
import { dueText } from './calendar-tab.tsx';
import { hasDue } from './model.ts';

/** The next seven days' bills, payday and IOU due dates, from the server. */
export function NextDays({
  today,
  locale,
}: {
  today: LocalDate;
  locale: string;
}) {
  const heading = useId();
  const calendar = useQuery(calendarQuery(today, addDays(today, 6)));
  const bills = useQuery(billsQuery);
  if (calendar.data === undefined) return null;
  const names = new Map(bills.data?.bills.map((b) => [b.id, b.name]));
  const due = calendar.data.days.filter(hasDue);
  return (
    <section aria-labelledby={heading}>
      <h2 id={heading} className="text-title">
        {t('calendar.next7.title')}
      </h2>
      {due.length === 0 ? (
        <p className="mt-3 text-body text-text-muted">
          {t('calendar.next7.empty')}
        </p>
      ) : (
        <ul className="mt-3 border-y border-outline-variant">
          {due.map((day) => (
            <li
              key={day.date}
              className="flex gap-4 border-b border-outline-variant px-4 py-3 last:border-b-0"
            >
              <span className="w-14 shrink-0 font-medium">
                {formatDay(day.date, locale)}
              </span>
              <span className="grid gap-0.5 text-body">
                {dueText(day, names, locale).map((text) => (
                  <span key={text}>{text}</span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/reports"
        search={{ tab: 'calendar' }}
        className="mt-2 inline-block w-fit font-medium underline underline-offset-4"
      >
        {t('calendar.next7.open')}
      </Link>
    </section>
  );
}
