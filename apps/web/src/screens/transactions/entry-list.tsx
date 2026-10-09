import { useEffect, useRef } from 'react';
import { Amount, type AmountKind } from '@/components/amount';
import { BracketButton, Chip } from '@/components/buttons';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { SummaryLine } from '@/components/stats';
import { CategoryIcon, EmptyState } from '@/components/states';
import { IconMoneyDollarCircleLine } from '@/generated/icons';
import { seriesNumber } from '@/lib/category-style';
import { t } from '@/messages/t';
import type { FilterChip } from './filter-model.ts';
import type { TxRow, TxSection } from './list-model.ts';

const columns: readonly RowColumn[] = [
  { width: '2.75rem' },
  { width: 'minmax(0, 1.4fr)' },
  { width: 'minmax(0, 1fr)', from: 'medium' },
  { width: 'minmax(0, 0.7fr)', from: 'wide' },
  { width: 'auto' },
];

function kindOf(row: TxRow): AmountKind {
  if (row.moves) return 'transfer';
  return (row.amount?.amountMinor ?? 0) < 0 ? 'expense' : 'income';
}

function EntryRow({
  row,
  selected,
  onSelect,
}: {
  row: TxRow;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const colour =
    row.style === null ? undefined : seriesNumber(row.style.colour);
  return (
    <Row
      tall
      className="cv-row"
      columns={columns}
      selected={selected}
      onPress={() => {
        onSelect(row.id);
      }}
      cells={[
        <span key="time" className="num text-text-muted">
          {row.time ?? t('transactions.list.noTime')}
        </span>,
        <span key="payee" className="flex items-center gap-2">
          {row.style?.icon == null ? (
            <IconMoneyDollarCircleLine
              aria-hidden="true"
              className="size-4 shrink-0 text-text-muted"
            />
          ) : (
            <CategoryIcon
              name={row.style.icon}
              {...(colour === undefined ? {} : { color: colour })}
            />
          )}
          <span className="truncate font-sans">{row.payee}</span>
        </span>,
        <span key="category" className="font-sans text-text-muted">
          {row.category ?? ''}
        </span>,
        <span key="account" className="font-sans text-text-muted">
          {row.account}
        </span>,
        row.amount === null ? null : (
          <Amount key="amount" amount={row.amount} kind={kindOf(row)} />
        ),
      ]}
    />
  );
}

/** The chip bar above the list: one chip per active filter, and a clear. */
export function ChipBar({
  chips,
  onRemove,
  onClear,
}: {
  chips: readonly FilterChip[];
  onRemove: (key: string) => void;
  onClear: () => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={t('transactions.list.chips')}
      className="flex flex-wrap items-center gap-1 border-b px-3 py-2"
    >
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          removeLabel={t('transactions.filter.remove', { label: chip.label })}
          onRemove={() => {
            onRemove(chip.key);
          }}
        />
      ))}
      <BracketButton onPress={onClear}>
        {t('transactions.list.clear')}
      </BracketButton>
    </div>
  );
}

export function EntryList({
  summary,
  sections,
  selectedId,
  filtered,
  onSelect,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  summary: readonly string[];
  sections: readonly TxSection[];
  selectedId: string | undefined;
  filtered: boolean;
  onSelect: (id: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (el === null || !hasMore || typeof IntersectionObserver === 'undefined')
      return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting === true) onLoadMore();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, onLoadMore, sections]);

  const empty = sections.every((s) => s.rows.length === 0);
  return (
    <div>
      {summary.length === 0 ? null : (
        <SummaryLine parts={summary} className="border-b px-3 py-1.5" />
      )}
      {empty ? (
        <EmptyState
          title={t(
            filtered
              ? 'transactions.list.emptyFiltered'
              : 'transactions.list.empty',
          )}
          hint={t(
            filtered
              ? 'transactions.list.emptyFilteredHint'
              : 'transactions.list.emptyHint',
          )}
        />
      ) : (
        sections.map((section) => (
          <section
            key={section.key}
            aria-label={section.title ?? t('transactions.list.title')}
          >
            {section.title === null ? null : (
              <h3 className="flex h-row items-center gap-2 border-b bg-chrome px-3 text-small">
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {section.title}
                </span>
                {section.total === null ? null : (
                  <span className="num shrink-0 text-text-muted">
                    {section.total}
                  </span>
                )}
              </h3>
            )}
            {section.rows.map((row) => (
              <EntryRow
                key={row.id}
                row={row}
                selected={row.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </section>
        ))
      )}
      {hasMore ? (
        <div ref={sentinel} className="border-b px-3 py-1">
          <BracketButton isDisabled={loadingMore} onPress={onLoadMore}>
            {t(
              loadingMore
                ? 'transactions.list.loadingMore'
                : 'transactions.list.more',
            )}
          </BracketButton>
        </div>
      ) : null}
    </div>
  );
}
