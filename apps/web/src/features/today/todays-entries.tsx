import { formatMoney } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Undo2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useQuickEntry } from '@/features/quick-entry/quick-entry-provider';
import { ApiError } from '@/lib/api';
import { entryQueryKeys, reverseTransaction } from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import type { EntryRow } from './entries.ts';

function amountText(row: EntryRow, locale: string): string | null {
  if (row.amount === null) return null;
  return formatMoney(row.amount, locale, {
    signDisplay: row.kind === 'transfer' ? 'never' : 'exceptZero',
  });
}

/** Category, else note, else the kind of entry. */
function entryTitle(row: EntryRow): string {
  return row.title ?? row.note ?? t(`today.entries.kinds.${row.kind}`);
}

function describe(row: EntryRow, locale: string): string {
  const amount = amountText(row, locale);
  return amount === null ? entryTitle(row) : `${entryTitle(row)}, ${amount}`;
}

function useUndo(onUndone: () => void) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all(
      entryQueryKeys.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await reverseTransaction(id);
      } catch (error) {
        // Undone elsewhere in the meantime (another tab, the bot): the
        // entry is undone, which is what was asked.
        if (
          error instanceof ApiError &&
          error.problem.code === 'already_reversed'
        )
          return;
        throw error;
      }
    },
    // Awaited, so the row shows as undone before focus and the
    // announcement move on.
    onSuccess: async () => {
      await refresh();
      onUndone();
    },
  });
}

function EntryItem({
  row,
  locale,
  opensCycle,
  onUndone,
}: {
  row: EntryRow;
  locale: string;
  /** The paycheck that opened the current cycle: undo asks first. */
  opensCycle: boolean;
  onUndone: (description: string) => void;
}) {
  const description = describe(row, locale);
  const undo = useUndo(() => {
    onUndone(description);
  });
  const [confirming, setConfirming] = useState(false);
  const confirmId = useId();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const amount = amountText(row, locale);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  const title = entryTitle(row);
  const details = [
    row.accounts.join(' → '),
    row.title !== null ? row.note : null,
  ].filter((part) => part !== null && part !== '');

  return (
    <li className="grid gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'min-w-0 flex-1',
            row.undone && 'text-muted-foreground',
          )}
        >
          <p className={cn('font-medium', row.undone && 'line-through')}>
            {title}
          </p>
          {details.length > 0 ? (
            <p className="truncate text-sm text-muted-foreground">
              {details.join(' · ')}
            </p>
          ) : null}
        </div>
        {amount === null ? null : (
          <p
            className={cn(
              'font-mono tabular-nums',
              row.undone && 'text-muted-foreground line-through',
              !row.undone && row.kind === 'income' && 'text-positive',
            )}
          >
            {amount}
          </p>
        )}
        <div className="flex w-24 shrink-0 justify-end">
          {row.undone ? (
            <span className="py-1.5 text-sm text-muted-foreground">
              {t('today.entries.undone')}
            </span>
          ) : (
            <Button
              ref={undoButton}
              variant="outlined"
              size="dense"
              aria-label={t('today.entries.undoLabel', { entry: description })}
              aria-expanded={opensCycle ? confirming : undefined}
              aria-controls={opensCycle && confirming ? confirmId : undefined}
              disabled={undo.isPending}
              onClick={() => {
                if (opensCycle) setConfirming(true);
                else undo.mutate(row.id);
              }}
            >
              <Undo2 aria-hidden />
              {undo.isPending
                ? t('today.entries.undoing')
                : t('today.entries.undo')}
            </Button>
          )}
        </div>
      </div>
      {confirming && !row.undone ? (
        <div id={confirmId} className="grid gap-3 rounded-md bg-plot p-4">
          <p>{t('today.entries.confirmPaycheck')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={confirmButton}
              size="dense"
              disabled={undo.isPending}
              onClick={() => {
                undo.mutate(row.id);
              }}
            >
              {undo.isPending
                ? t('today.entries.undoing')
                : t('today.entries.confirmUndo')}
            </Button>
            <Button
              variant="outlined"
              size="dense"
              disabled={undo.isPending}
              onClick={() => {
                setConfirming(false);
                undoButton.current?.focus();
              }}
            >
              {t('today.entries.keep')}
            </Button>
          </div>
        </div>
      ) : null}
      {undo.isError ? (
        <p role="alert" className="text-sm font-medium text-over">
          {errorMessage(undo.error)}
        </p>
      ) : null}
    </li>
  );
}

// Today's entries with undo (FR-L4): an undo posts a reversal, so the row
// stays, marked undone. After an undo the button is gone, so focus goes to
// the list's heading and a polite live region says what happened.
export function TodaysEntries({
  rows,
  locale,
  cycleOpenedBy,
}: {
  rows: EntryRow[];
  locale: string;
  cycleOpenedBy: string | null;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const [announcement, setAnnouncement] = useState('');
  const quickEntry = useQuickEntry();

  return (
    <section aria-labelledby={headingId} className="mt-10">
      <h2
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="font-medium outline-none"
      >
        {t('today.entries.title')}
      </h2>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {rows.length === 0 ? (
        <div className="mt-3 grid justify-items-start gap-3">
          <p className="text-muted-foreground">{t('today.entries.empty')}</p>
          <Button
            variant="outlined"
            onClick={(event) => {
              quickEntry.open(event.currentTarget);
            }}
          >
            <Plus aria-hidden />
            {t('today.entries.add')}
          </Button>
        </div>
      ) : (
        <ul className="mt-1">
          {rows.map((row) => (
            <EntryItem
              key={row.id}
              row={row}
              locale={locale}
              opensCycle={row.id === cycleOpenedBy}
              onUndone={(description) => {
                setAnnouncement(
                  t('today.entries.undoneAnnounce', { entry: description }),
                );
                heading.current?.focus();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
