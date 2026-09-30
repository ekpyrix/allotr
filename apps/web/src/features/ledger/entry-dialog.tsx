import {
  formatMoney,
  type AccountView,
  type CategoryView,
  type TransactionView,
} from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useRef, useState } from 'react';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { QuickEntryForm } from '@/features/quick-entry/quick-entry-form';
import { entryCategoryIds } from '@/lib/entry-categories';
import {
  allAccountsQuery,
  allCategoriesQuery,
  entryQuery,
  ledgerSettingsQuery,
  tagsQuery,
  todayQuery,
} from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';
import { draftFromEntry, isEditable } from './edit-draft.ts';
import {
  formatLongDay,
  formatMoment,
  rateText,
  rowAmount,
  rowTitle,
} from './format.ts';
import { ledgerRows } from './rows.ts';
import type { LedgerSearch } from './search.ts';
import { useDeleteEntry, useRestoreEntry } from './use-delete-entry.ts';

type Confirm = 'paycheck' | 'opening' | null;

function EntryDetail({
  entry,
  accounts,
  categories,
  tags,
  locale,
  timeZone,
  cycleOpenedBy,
  search,
  onEdit,
  onUndone,
  onRestored,
}: {
  entry: TransactionView;
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  tags: readonly { id: string; name: string }[];
  locale: string;
  timeZone: string;
  cycleOpenedBy: string | null;
  search: LedgerSearch;
  onEdit: () => void;
  onUndone: () => void;
  onRestored: (copyId: string) => void;
}) {
  const undo = useDeleteEntry(onUndone);
  const restore = useRestoreEntry();
  const [confirming, setConfirming] = useState(false);
  const confirmId = useId();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  const accountOf = new Map(accounts.map((a) => [a.id, a]));
  const categoryPath = (id: string) => {
    const category = categories.find((c) => c.id === id);
    if (category === undefined) return null;
    const parent =
      category.parentId === null
        ? undefined
        : categories.find((c) => c.id === category.parentId);
    return parent === undefined
      ? category.name
      : `${parent.name} / ${category.name}`;
  };
  const categoryIds = entryCategoryIds(entry);
  const split = entry.categoryId === null && categoryIds.length > 1;
  const categoryText = categoryIds
    .map(categoryPath)
    .filter((path) => path !== null)
    .join(', ');
  const [row] = ledgerRows([entry], accounts, categories);
  const description =
    row === undefined
      ? t(`ledger.kinds.${entry.kind}`)
      : [rowTitle(row), rowAmount(row, locale)]
          .filter((part) => part !== null)
          .join(', ');
  const tagNames = entry.tagIds
    .map((id) => tags.find((tag) => tag.id === id)?.name)
    .filter((name) => name !== undefined);
  const rate = rateText(entry);
  const touchesArchived = entry.postings.some(
    (p) => accountOf.get(p.accountId)?.archived === true,
  );
  const open = entry.reversedById === null && !touchesArchived;
  const canUndo =
    open && entry.kind !== 'reversal' && entry.kind !== 'budget_switch';
  const canEdit = open && isEditable(entry);
  const canRestore =
    entry.reversedById !== null &&
    entry.restoredById === null &&
    !touchesArchived &&
    entry.kind !== 'reversal' &&
    entry.kind !== 'budget_switch';
  const confirm: Confirm =
    entry.id === cycleOpenedBy
      ? 'paycheck'
      : entry.kind === 'opening'
        ? 'opening'
        : null;

  const facts: [string, string][] = [
    [t('ledger.entry.date'), formatLongDay(entry.occurredOn, locale)],
    ...(categoryText === ''
      ? []
      : [
          [
            split ? t('ledger.entry.split') : t('ledger.entry.category'),
            categoryText,
          ] as [string, string],
        ]),
    ...(row === undefined || row.accounts.length === 0
      ? []
      : [
          [t('ledger.entry.accounts'), row.accounts.join(' → ')] as [
            string,
            string,
          ],
        ]),
    ...(entry.note === null
      ? []
      : [[t('ledger.entry.note'), entry.note] as [string, string]]),
    ...(tagNames.length === 0
      ? []
      : [[t('ledger.entry.tags'), tagNames.join(', ')] as [string, string]]),
    ...(rate === null
      ? []
      : [[t('ledger.entry.rate'), rate] as [string, string]]),
    [
      t('ledger.entry.entered'),
      formatMoment(entry.createdAt, locale, timeZone),
    ],
    [t('ledger.entry.source'), t(`ledger.entry.sources.${entry.source}`)],
  ];

  return (
    <div className="mt-4 grid gap-6">
      {row === undefined ? null : (
        <p className="font-mono text-3xl font-semibold tabular-nums">
          {rowAmount(row, locale) ?? ''}
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-sm text-text-muted">{term}</dt>
            <dd className="min-w-0 wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>

      {entry.postings.length === 0 ? null : (
        <table className="w-full text-sm">
          <caption className="mb-2 text-left font-medium">
            {t('ledger.entry.postings')}
          </caption>
          <thead>
            <tr className="border-b border-outline-variant text-text-muted">
              <th scope="col" className="py-1 text-left font-normal">
                {t('ledger.entry.account')}
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                {t('ledger.entry.amount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {entry.postings.map((p, index) => (
              <tr
                key={index}
                className="border-b border-outline-variant last:border-0"
              >
                <td className="py-1.5">
                  {p.systemRole === null
                    ? (accountOf.get(p.accountId)?.name ?? '')
                    : t(`ledger.entry.roles.${p.systemRole}`, {
                        currency: p.amount.currency,
                      })}
                  {split && p.categoryId !== null
                    ? ` · ${categoryPath(p.categoryId) ?? ''}`
                    : null}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  {formatMoney(p.amount, locale, { signDisplay: 'exceptZero' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {entry.reversedById === null ? null : (
        <p>
          {t('ledger.entry.undoneBy')}{' '}
          <Link
            to="/ledger"
            search={{ ...search, entry: entry.reversedById }}
            replace
            className="font-medium underline underline-offset-4"
          >
            {t('ledger.entry.showUndo')}
          </Link>
        </p>
      )}
      {entry.restoredById === null ? null : (
        <p>
          {t('ledger.entry.restoredBy')}{' '}
          <Link
            to="/ledger"
            search={{ ...search, entry: entry.restoredById }}
            replace
            className="font-medium underline underline-offset-4"
          >
            {t('ledger.entry.showRestored')}
          </Link>
        </p>
      )}
      {canRestore ? (
        <Button
          variant="tonal"
          className="w-fit"
          disabled={restore.isPending}
          onClick={() => {
            restore.mutate(
              { id: entry.id, description },
              {
                onSuccess: (copyId) => {
                  onRestored(copyId);
                },
              },
            );
          }}
        >
          <RotateCcw aria-hidden />
          {restore.isPending
            ? t('ledger.entry.restoring')
            : t('ledger.entry.restore')}
        </Button>
      ) : null}
      {entry.reversesId === null ? null : (
        <p>
          {t('ledger.entry.undoes')}{' '}
          <Link
            to="/ledger"
            search={{ ...search, entry: entry.reversesId }}
            replace
            className="font-medium underline underline-offset-4"
          >
            {t('ledger.entry.showOriginal')}
          </Link>
        </p>
      )}
      {touchesArchived && entry.reversedById === null ? (
        <p className="text-text-muted">{t('ledger.entry.archived')}</p>
      ) : null}

      {canUndo || canEdit ? (
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button onClick={onEdit}>
              <Pencil aria-hidden />
              {t('ledger.entry.edit')}
            </Button>
          ) : null}
          {canUndo ? (
            <Button
              ref={undoButton}
              variant="outlined"
              aria-expanded={confirm === null ? undefined : confirming}
              aria-controls={
                confirm !== null && confirming ? confirmId : undefined
              }
              disabled={undo.isPending}
              onClick={() => {
                if (confirm === null)
                  undo.mutate({ id: entry.id, description });
                else setConfirming(true);
              }}
            >
              <Trash2 aria-hidden />
              {undo.isPending
                ? t('ledger.entry.undoing')
                : t('ledger.entry.undo')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {confirming && confirm !== null && canUndo ? (
        <div id={confirmId} className="grid gap-3 rounded-md bg-card p-4">
          <p>
            {confirm === 'paycheck'
              ? t('ledger.entry.confirmPaycheck')
              : t('ledger.entry.confirmOpening')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={confirmButton}
              size="dense"
              disabled={undo.isPending}
              onClick={() => {
                undo.mutate({ id: entry.id, description });
              }}
            >
              {undo.isPending
                ? t('ledger.entry.undoing')
                : t('ledger.entry.confirmUndo')}
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
              {t('ledger.entry.keep')}
            </Button>
          </div>
        </div>
      ) : null}
      {undo.isError ? <FormError message={errorMessage(undo.error)} /> : null}
    </div>
  );
}

function EntryLoader({
  id,
  search,
  editing,
  saving,
  onEditingChange,
  onSavingChange,
  onEdited,
  onRestored,
  onFocusTitle,
}: {
  id: string;
  search: LedgerSearch;
  editing: boolean;
  saving: boolean;
  onEditingChange: (editing: boolean) => void;
  onSavingChange: (saving: boolean) => void;
  onEdited: (replacementId: string) => void;
  onRestored: (copyId: string) => void;
  /** After a delete, which the snackbar announces. */
  onFocusTitle: () => void;
}) {
  const entry = useQuery(entryQuery(id));
  const accounts = useQuery(allAccountsQuery);
  const categories = useQuery(allCategoriesQuery);
  const tags = useQuery(tagsQuery);
  const settings = useQuery(ledgerSettingsQuery);
  const today = useQuery(todayQuery);
  const all = [entry, accounts, categories, tags, settings, today];

  const failed = all.find((q) => q.isError && q.data === undefined);
  if (failed !== undefined)
    return (
      <div className="mt-6 grid justify-items-start gap-4">
        <FormError message={errorMessage(failed.error)} />
        <Button
          onClick={() => {
            for (const q of all) if (q.isError) void q.refetch();
          }}
        >
          {t('errors.retry')}
        </Button>
      </div>
    );
  if (
    entry.data === undefined ||
    accounts.data === undefined ||
    categories.data === undefined ||
    tags.data === undefined ||
    settings.data === undefined ||
    today.data === undefined
  )
    return (
      <p role="status" className="mt-6 text-text-muted">
        {t('ledger.entry.loading')}
      </p>
    );

  const { locale, timeZone } = settings.data;
  const view = entry.data;
  const byId = new Map(categories.data.categories.map((c) => [c.id, c]));
  // A merged category files under its target, which the form offers.
  const current = (id: string | null): string | null => {
    let found = id === null ? undefined : byId.get(id);
    for (let hops = 0; found?.mergedIntoId != null && hops < 10; hops += 1)
      found = byId.get(found.mergedIntoId);
    return found?.id ?? id;
  };
  if (editing && isEditable(view))
    return (
      <>
        <QuickEntryForm
          accounts={accounts.data.accounts.filter((a) => !a.archived)}
          categories={categories.data.categories}
          tags={tags.data.tags}
          locale={locale}
          today={today.data.today}
          edit={{
            id: view.id,
            draft: draftFromEntry(
              {
                ...view,
                categoryId: current(view.categoryId),
                postings: view.postings.map((p) => ({
                  ...p,
                  categoryId: current(p.categoryId),
                })),
              },
              locale,
            ),
          }}
          onSavingChange={onSavingChange}
          onSaved={(_message, replacementId) => {
            onEdited(replacementId);
          }}
        />
        <Button
          variant="text"
          className="mt-2 w-full"
          disabled={saving}
          onClick={() => {
            onEditingChange(false);
          }}
        >
          {t('ledger.entry.cancelEdit')}
        </Button>
      </>
    );

  return (
    <EntryDetail
      entry={view}
      accounts={accounts.data.accounts}
      categories={categories.data.categories}
      tags={tags.data.tags}
      locale={locale}
      timeZone={timeZone}
      cycleOpenedBy={today.data.cycle.openedBy}
      search={search}
      onEdit={() => {
        onEditingChange(true);
      }}
      onUndone={onFocusTitle}
      onRestored={onRestored}
    />
  );
}

function titleOf(
  entry: TransactionView | undefined,
  accounts: readonly AccountView[] | undefined,
  categories: readonly CategoryView[] | undefined,
): string {
  if (entry === undefined) return t('ledger.title');
  const [row] = ledgerRows([entry], accounts ?? [], categories ?? []);
  return row === undefined ? t(`ledger.kinds.${entry.kind}`) : rowTitle(row);
}

// One entry over the list, opened from `?entry=`. Closing it goes back to
// the list and returns focus to the entry's row. A pending save or undo
// cannot be dismissed, so its result is never lost.
/**
 * One entry, to read, edit or undo (FR-L4). Below the expanded size class
 * it is a dialog (a sheet on phones); from it, `pane` shows it beside the
 * list instead, non-modal (spec §11.2). Either way `?entry=` deep-links it.
 */
export function EntryDialog({
  id,
  search,
  onClose,
  onShow,
  pane = false,
}: {
  id: string | undefined;
  search: LedgerSearch;
  onClose: () => void;
  /** Shows another entry in the dialog, replacing the history step. */
  onShow: (id: string) => void;
  /** Beside the list rather than over it. */
  pane?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const entry = useQuery({
    ...entryQuery(id ?? ''),
    enabled: id !== undefined,
  });
  const accounts = useQuery(allAccountsQuery);
  const categories = useQuery(allCategoriesQuery);

  // A different entry starts in the detail view.
  const [shown, setShown] = useState(id);
  if (shown !== id) {
    setShown(id);
    setEditing(false);
  }

  // In the pane, choosing an entry moves focus to it, as opening the
  // dialog does.
  useEffect(() => {
    if (pane && id !== undefined) title.current?.focus();
  }, [pane, id]);

  const heading = editing
    ? t('ledger.entry.editTitle')
    : titleOf(entry.data, accounts.data?.accounts, categories.data?.categories);

  // The entry last shown: once it closes, the URL (and so `id`) no longer
  // names it, but focus should go back to its row.
  const [lastId, setLastId] = useState(id);
  if (id !== undefined && id !== lastId) setLastId(id);

  // Focus goes back to the entry's row, or to <main> when the row is
  // filtered out.
  const focusRow = () => {
    setAnnouncement('');
    const last = lastId;
    const row =
      last === undefined
        ? null
        : document.querySelector<HTMLElement>(
            `[data-entry-id="${CSS.escape(last)}"]`,
          );
    (row ?? document.querySelector<HTMLElement>('main'))?.focus();
  };

  const titleClass = 'text-title outline-hidden';
  const closeButton = (
    <Button
      variant="text"
      size="icon"
      aria-label={t('ledger.entry.close')}
      disabled={saving}
      onClick={
        pane
          ? () => {
              onClose();
              requestAnimationFrame(focusRow);
            }
          : undefined
      }
    >
      <X aria-hidden="true" />
    </Button>
  );
  const body = (
    <>
      <div className="flex items-center justify-between gap-4">
        {pane ? (
          <h2 id={titleId} ref={title} tabIndex={-1} className={titleClass}>
            {heading}
          </h2>
        ) : (
          <Dialog.Title ref={title} tabIndex={-1} className={titleClass}>
            {heading}
          </Dialog.Title>
        )}
        {pane ? (
          closeButton
        ) : (
          <Dialog.Close asChild>{closeButton}</Dialog.Close>
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {id === undefined ? null : (
        <EntryLoader
          key={id}
          id={id}
          search={search}
          editing={editing}
          saving={saving}
          onEditingChange={(next) => {
            setEditing(next);
            setAnnouncement('');
            requestAnimationFrame(() => title.current?.focus());
          }}
          onSavingChange={setSaving}
          onEdited={(replacementId) => {
            setAnnouncement(t('ledger.entry.edited'));
            onShow(replacementId);
            requestAnimationFrame(() => title.current?.focus());
          }}
          onRestored={(copyId) => {
            onShow(copyId);
            requestAnimationFrame(() => title.current?.focus());
          }}
          onFocusTitle={() => {
            title.current?.focus();
          }}
        />
      )}
    </>
  );

  if (pane)
    return id === undefined ? (
      <div className="sticky top-20 rounded-2xl bg-card p-6 text-body text-text-muted">
        {t('ledger.pickEntry')}
      </div>
    ) : (
      <section
        data-slot="entry-pane"
        aria-labelledby={titleId}
        // Escape closes the pane as it closes the dialog.
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || saving) return;
          event.preventDefault();
          onClose();
          requestAnimationFrame(focusRow);
        }}
        className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl bg-card p-6 text-text"
      >
        {body}
      </section>
    );

  return (
    <Dialog.Root
      open={id !== undefined}
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/40 data-[state=open]:scrim-in dark:bg-black/60" />
        <Dialog.Content
          ref={content}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            title.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focusRow();
          }}
          className="fixed inset-x-0 bottom-0 z-40 max-h-[92dvh] overflow-y-auto rounded-t-2xl border border-b-0 border-outline-variant bg-card-raised p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-text outline-hidden data-[state=open]:rise-in medium:inset-x-auto medium:top-1/2 medium:bottom-auto medium:left-1/2 medium:w-full medium:max-w-[560px] medium:-translate-x-1/2 medium:-translate-y-1/2 medium:rounded-2xl medium:border-b medium:data-[state=open]:overlay-in"
        >
          {body}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
