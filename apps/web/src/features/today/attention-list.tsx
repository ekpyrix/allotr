import { formatMoney, type TodayView } from '@allotr/shared';
import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { t } from '@/messages/t';
import { formatDay } from './format.ts';

// What the user should look at before trusting the figures: the flags from
// `/v1/today`. Rates, payday and bills are managed in Budget.
function Item({
  children,
  action,
}: {
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className="flex gap-4 border-b border-outline-variant px-4 py-3 last:border-b-0">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-md bg-warning-container text-text"
      >
        <TriangleAlert className="size-5 stroke-[1.75]" />
      </span>
      <div className="grid gap-1 text-body">
        <p>{children}</p>
        {action}
      </div>
    </li>
  );
}

const linkClass = 'w-fit font-medium underline underline-offset-4';

export function AttentionList({
  figures,
  locale,
}: {
  figures: TodayView;
  locale: string;
}) {
  const heading = useId();
  const { overdue, missingRates, billsDue, today } = figures;
  if (!overdue && missingRates.length === 0 && billsDue.length === 0)
    return null;

  return (
    <section aria-labelledby={heading}>
      <h2 id={heading} className="text-title">
        {t('today.attention.title')}
      </h2>
      <ul className="mt-3 overflow-hidden border-y border-outline-variant">
        {overdue ? (
          <Item
            action={
              <Link to="/settings" hash="payday" className={linkClass}>
                {t('today.attention.overdueAction')}
              </Link>
            }
          >
            {t('today.attention.overdue')}
          </Item>
        ) : null}
        {missingRates.map((currency) => (
          <Item
            key={currency}
            action={
              <Link to="/settings" hash="rates" className={linkClass}>
                {t('today.attention.missingRateAction', { currency })}
              </Link>
            }
          >
            {t('today.attention.missingRate', { currency })}
          </Item>
        ))}
        {billsDue.map((bill) => {
          const amount =
            bill.price === null
              ? formatMoney(bill.amount, locale)
              : t('today.attention.pricedAmount', {
                  price: formatMoney(bill.price, locale),
                  amount: formatMoney(bill.amount, locale),
                });
          return (
            <Item
              key={`${bill.billId}:${bill.dueOn}`}
              action={
                <Link to="/budget" className={linkClass}>
                  {t('today.attention.billAction', { name: bill.name })}
                </Link>
              }
            >
              {bill.dueOn === today
                ? t('today.attention.billDueToday', { name: bill.name, amount })
                : t('today.attention.billDue', {
                    name: bill.name,
                    amount,
                    date: formatDay(bill.dueOn, locale),
                  })}
            </Item>
          );
        })}
      </ul>
    </section>
  );
}
