import { formatMoney } from '@allotr/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useQuickEntry } from '@/features/quick-entry/quick-entry-provider';
import { useDeleteEntry } from '@/features/ledger/use-delete-entry';
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

type Deletion = ReturnType<typeof useDeleteEntry>;

function EntryItem({
  row,
  locale,
  confirm,
  deletion,
}: {
  row: EntryRow;
  locale: string;
  /** The paycheck that opened the cycle, or an opening balance: asks first. */
  confirm: 'paycheck' | 'opening' | null;
  deletion: Deletion;
}) {
  const description = describe(row, locale);
  const [confirming, setConfirming] = useState(false);
  const confirmId = useId();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const amount = amountText(row, locale);
  const mine = deletion.variables?.id === row.id;
  const pending = deletion.isPending && mine;
  const remove = () => {
    deletion.mutate({ id: row.id, description });
  };

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  const title = entryTitle(row);
  const details = [
    row.accounts.join(' → '),
    row.title !== null ? row.note : null,
  ].filter((part) => part !== null && part !== '');

  return (
    <li className="grid gap-2 border-b border-outline-variant px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          {details.length > 0 ? (
            <p className="truncate text-body text-text-muted">
              {details.join(' · ')}
            </p>
          ) : null}
        </div>
        {amount === null ? null : (
          <p
            className={cn(
              'font-mono tabular-nums',
              row.kind === 'income' && 'text-positive',
            )}
          >
            {amount}
          </p>
        )}
        <div className="flex w-24 shrink-0 justify-end">
          <Button
            ref={deleteButton}
            variant="outlined"
            size="dense"
            aria-label={t('today.entries.undoLabel', { entry: description })}
            aria-expanded={confirm === null ? undefined : confirming}
            aria-controls={
              confirm !== null && confirming ? confirmId : undefined
            }
            disabled={pending}
            onClick={() => {
              if (confirm === null) remove();
              else setConfirming(true);
            }}
          >
            <Trash2 aria-hidden />
            {pending ? t('today.entries.undoing') : t('today.entries.undo')}
          </Button>
        </div>
      </div>
      {confirming && confirm !== null ? (
        <div
          id={confirmId}
          className="grid gap-3 rounded-md bg-card-raised p-4 text-body"
        >
          <p>
            {confirm === 'paycheck'
              ? t('today.entries.confirmPaycheck')
              : t('today.entries.confirmOpening')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={confirmButton}
              size="dense"
              disabled={pending}
              onClick={remove}
            >
              {pending
                ? t('today.entries.undoing')
                : t('today.entries.confirmUndo')}
            </Button>
            <Button
              variant="outlined"
              size="dense"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                deleteButton.current?.focus();
              }}
            >
              {t('today.entries.keep')}
            </Button>
          </div>
        </div>
      ) : null}
      {deletion.isError && mine ? (
        <p role="alert" className="text-body font-medium text-negative">
          {errorMessage(deletion.error)}
        </p>
      ) : null}
    </li>
  );
}

// Today's entries with delete (FR-L4). A deleted row leaves the list, so
// focus goes to the list's heading; the snackbar says what happened and
// offers Undo, which restores the entry.
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
  const quickEntry = useQuickEntry();
  // Here rather than on each row, which is gone once its entry is.
  const deletion = useDeleteEntry(() => {
    heading.current?.focus();
  });

  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="text-title outline-none"
      >
        {t('today.entries.title')}
      </h2>
      {rows.length === 0 ? (
        <div className="mt-3 grid justify-items-start gap-3 rounded-lg bg-card p-4">
          <p className="text-body-lg">{t('today.entries.empty')}</p>
          <Button
            variant="tonal"
            onClick={(event) => {
              quickEntry.open(event.currentTarget);
            }}
          >
            <Plus aria-hidden />
            {t('today.entries.add')}
          </Button>
        </div>
      ) : (
        <ul className="mt-3 overflow-hidden rounded-lg bg-card">
          {rows.map((row) => (
            <EntryItem
              key={row.id}
              row={row}
              locale={locale}
              confirm={
                row.id === cycleOpenedBy
                  ? 'paycheck'
                  : row.kind === 'opening'
                    ? 'opening'
                    : null
              }
              deletion={deletion}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
