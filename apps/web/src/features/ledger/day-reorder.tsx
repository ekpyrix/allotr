import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FormError } from '@/components/field';
import { Amount } from '@/components/ui/amount';
import { Button } from '@/components/ui/button';
import { moveItem } from '@/features/budget/order';
import { entryQueryKeys, moveTransaction } from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import { rowTitle } from './format.ts';
import { afterIdAt, type LedgerRow } from './rows.ts';

/**
 * One day's entries in an order the user can change (docs/domain.md
 * "Order within a day"), newest at the top as in the list. Drag a row by
 * its handle, press Up or Down on the handle, or use the buttons, which
 * also work by touch. Each move saves at once; the server refuses one that
 * would put entries with a time out of time order, and says why.
 */
export function DayReorder({
  dayLabel,
  rows,
  locale,
}: {
  dayLabel: string;
  /** Newest first. */
  rows: readonly LedgerRow[];
  locale: string;
}) {
  const queryClient = useQueryClient();
  const [announce, setAnnounce] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  // A moved row is re-inserted, which drops focus; it returns to the
  // handle of the row that moved once the new order renders.
  const focusId = useRef<string | null>(null);
  useEffect(() => {
    if (focusId.current === null) return;
    handles.current.get(focusId.current)?.focus();
    focusId.current = null;
  }, [rows]);
  const save = useMutation({
    mutationFn: (input: { id: string; afterId: string | null }) =>
      moveTransaction(input.id, input.afterId),
    onSuccess: async () => {
      await Promise.all(
        entryQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  const problem = save.isError ? describeProblem(save.error) : null;

  function move(from: number, to: number) {
    const row = rows[from];
    if (row === undefined || to < 0 || to >= rows.length || from === to) return;
    const next = moveItem(rows, from, to);
    setAnnounce(
      t('ledger.reorder.moved', {
        name: rowTitle(row),
        position: to + 1,
        count: rows.length,
      }),
    );
    focusId.current = row.id;
    save.mutate({ id: row.id, afterId: afterIdAt(next, to) });
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const delta =
      event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    move(index, index + delta);
  }

  return (
    <div>
      <p className="px-4 py-2 text-caption text-text-muted">
        {t('ledger.reorder.intro')}
      </p>
      <ol
        aria-label={t('ledger.reorder.list', { day: dayLabel })}
        className="border-y border-outline-variant"
      >
        {rows.map((row, index) => (
          <li
            key={row.id}
            data-entry-id={row.id}
            draggable
            onDragStart={() => {
              setDragging(index);
            }}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={() => {
              if (dragging !== null) move(dragging, index);
              setDragging(null);
            }}
            onDragEnd={() => {
              setDragging(null);
            }}
            className="flex min-h-(--row-h) items-center gap-2 border-b border-outline-variant py-1 pl-1 last:border-b-0"
          >
            <button
              type="button"
              ref={(el) => {
                if (el === null) handles.current.delete(row.id);
                else handles.current.set(row.id, el);
              }}
              aria-roledescription={t('ledger.reorder.sortable')}
              aria-label={t('ledger.reorder.handle', {
                name: rowTitle(row),
                position: index + 1,
                count: rows.length,
              })}
              onKeyDown={(e) => {
                onKeyDown(e, index);
              }}
              className="flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md text-text-muted hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <GripVertical aria-hidden="true" className="size-5" />
            </button>
            <span className="min-w-0 flex-1">
              <span className="block text-body wrap-anywhere">
                {rowTitle(row)}
              </span>
              {row.occurredTime === null ? null : (
                <span className="block text-caption text-text-muted">
                  {row.occurredTime}
                </span>
              )}
            </span>
            {row.amount === null ? null : (
              <Amount
                amount={row.amount}
                locale={locale}
                kind={row.moves ? 'transfer' : undefined}
                className="shrink-0 text-body"
              />
            )}
            <Button
              variant="text"
              size="icon"
              aria-label={t('ledger.reorder.up', { name: rowTitle(row) })}
              disabled={index === 0 || save.isPending}
              onClick={() => {
                move(index, index - 1);
              }}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              variant="text"
              size="icon"
              aria-label={t('ledger.reorder.down', { name: rowTitle(row) })}
              disabled={index === rows.length - 1 || save.isPending}
              onClick={() => {
                move(index, index + 1);
              }}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ol>
      <p role="status" className="sr-only">
        {announce}
      </p>
      <div className="px-4">
        <FormError message={problem?.message ?? null} />
      </div>
    </div>
  );
}
