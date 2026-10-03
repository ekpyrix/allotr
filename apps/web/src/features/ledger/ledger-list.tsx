import { type TransactionListView } from '@allotr/shared';
import { Link } from '@tanstack/react-router';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  Landmark,
  Receipt,
  Repeat,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Amount } from '@/components/ui/amount';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/ui/category-icon';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { formatLongDay, rowTitle } from './format.ts';
import { byDay, type LedgerRow } from './rows.ts';
import type { LedgerSearch } from './search.ts';

const kindIcons: Record<LedgerRow['kind'], LucideIcon> = {
  expense: Receipt,
  income: ArrowDownLeft,
  transfer: ArrowLeftRight,
  opening: Landmark,
  write_off: Receipt,
  reversal: Undo2,
  budget_switch: Repeat,
};

function Row({
  row,
  locale,
  search,
}: {
  row: LedgerRow;
  locale: string;
  search: LedgerSearch;
}) {
  const Icon = kindIcons[row.kind];
  const muted = row.undone || row.kind === 'reversal';
  const details = [
    row.accounts.filter((name) => name !== '').join(' → '),
    row.kind === 'reversal' || row.title === null ? null : row.note,
  ].filter((part) => part !== null && part !== '');
  return (
    <li>
      <Link
        to="/transactions"
        search={{ ...search, entry: row.id }}
        data-entry-id={row.id}
        aria-current={search.entry === row.id ? 'true' : undefined}
        className="flex min-h-(--row-h) items-center gap-3 px-4 py-1.5 transition-colors duration-(--dur-fade) hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring aria-[current=true]:bg-card"
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-6 shrink-0 items-center justify-center',
            row.moves && !muted ? 'text-info' : 'text-text-muted',
          )}
        >
          {row.style === null || muted ? (
            <Icon className="size-5 stroke-[1.75]" />
          ) : (
            <CategoryIcon style={row.style} fallback={Icon} />
          )}
        </span>
        <span className={cn('min-w-0 flex-1', muted && 'text-text-muted')}>
          <span
            className={cn(
              'block text-body wrap-anywhere',
              row.undone && 'line-through',
            )}
          >
            {rowTitle(row)}
          </span>
          {details.length > 0 ? (
            <span className="block truncate text-caption text-text-muted">
              {details.join(' · ')}
            </span>
          ) : null}
        </span>
        {row.amount === null ? null : (
          <Amount
            amount={row.amount}
            locale={locale}
            kind={row.moves ? 'transfer' : undefined}
            muted={muted}
            className={cn('shrink-0 text-body', row.undone && 'line-through')}
          />
        )}
        {row.undone ? (
          <span className="shrink-0 text-body text-text-muted">
            {t('ledger.undone')}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

// Entries by day, newest first, a page at a time. After "Load more",
// focus moves to the first new entry so keyboard users carry on reading.
export function LedgerList({
  rows,
  dayTotals,
  locale,
  search,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  rows: LedgerRow[];
  /** The server's net total per day, over every matching entry. */
  dayTotals: ReadonlyMap<string, TransactionListView['dayTotals'][number]>;
  locale: string;
  search: LedgerSearch;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const focusFrom = useRef<number | null>(null);

  useEffect(() => {
    const from = focusFrom.current;
    if (from === null || rows.length <= from) return;
    focusFrom.current = null;
    const id = rows[from]?.id;
    if (id === undefined) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"]`)
      ?.focus();
  }, [rows]);

  return (
    <div ref={list}>
      {byDay(rows).map((group) => {
        const headingId = `ledger-day-${group.day}`;
        const total = dayTotals.get(group.day);
        return (
          <section key={group.day} aria-labelledby={headingId} className="mt-4">
            <h2
              id={headingId}
              className="sticky top-16 z-[5] -mx-1 flex items-baseline justify-between gap-3 bg-canvas px-1 py-2 text-label text-text-muted"
            >
              <span>{formatLongDay(group.day, locale)}</span>
              {total === undefined ? null : (
                <span>
                  <span className="sr-only">{t('ledger.dayNet')} </span>
                  <Amount amount={total.net} locale={locale} />
                </span>
              )}
            </h2>
            <ul className="overflow-hidden border-y border-outline-variant">
              {group.rows.map((row) => (
                <Row key={row.id} row={row} locale={locale} search={search} />
              ))}
            </ul>
          </section>
        );
      })}
      {hasMore ? (
        <Button
          variant="outlined"
          className="mt-6"
          disabled={loadingMore}
          onClick={() => {
            focusFrom.current = rows.length;
            onLoadMore();
          }}
        >
          {loadingMore ? t('ledger.loadingMore') : t('ledger.more')}
        </Button>
      ) : null}
    </div>
  );
}
