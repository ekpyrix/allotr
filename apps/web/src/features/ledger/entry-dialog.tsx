import {
  formatMoney,
  type AccountView,
  type CategoryView,
  type TransactionView,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Pencil, Undo2, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useRef, useState } from 'react';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { QuickEntryForm } from '@/features/quick-entry/quick-entry-form';
import { ApiError } from '@/lib/api';
import {
  allAccountsQuery,
  allCategoriesQuery,
  entryQuery,
  entryQueryKeys,
  ledgerSettingsQuery,
  reverseTransaction,
  tagsQuery,
  todayQuery,
} from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';
import { draftFromEntry, isEditable } from './edit-draft.ts';
import { formatLongDay, formatMoment, rowAmount, rowTitle } from './format.ts';
import { ledgerRows } from './rows.ts';
import type { LedgerSearch } from './search.ts';

/** The currencies a rate converts between, read from the exchange legs. */
function rateCurrencies(entry: TransactionView) {
  const legs = entry.postings.filter((p) => p.systemRole === 'conversion');
  // Core books the sent side positive and the received side negative; an
  // undo has them the other way round.
  const sign = entry.kind === 'reversal' ? -1 : 1;
  const from = legs.find((p) => sign * p.amount.amountMinor > 0);
  const to = legs.find((p) => sign * p.amount.amountMinor < 0);
  return from === undefined || to === undefined
    ? null
    : { from: from.amount.currency, to: to.amount.currency };
}

function useUndo(onUndone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await reverseTransaction(id);
      } catch (error) {
        // Undone elsewhere in the meantime: what was asked is done.
        if (
          error instanceof ApiError &&
          error.problem.code === 'already_reversed'
        )
          return;
        throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all(
        entryQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      onUndone();
    },
  });
}

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
}) {
  const undo = useUndo(onUndone);
  const [confirming, setConfirming] = useState(false);
  const confirmId = useId();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  const accountOf = new Map(accounts.map((a) => [a.id, a]));
  const category =
    entry.categoryId === null
      ? null
      : (categories.find((c) => c.id === entry.categoryId) ?? null);
  const parent =
    category?.parentId == null
      ? null
      : categories.find((c) => c.id === category.parentId);
  const [row] = ledgerRows([entry], accounts, categories);
  const tagNames = entry.tagIds
    .map((id) => tags.find((tag) => tag.id === id)?.name)
    .filter((name) => name !== undefined);
  const rate = entry.impliedRate === null ? null : rateCurrencies(entry);
  const touchesArchived = entry.postings.some(
    (p) => accountOf.get(p.accountId)?.archived === true,
  );
  const open = entry.reversedById === null && !touchesArchived;
  const canUndo =
    open && entry.kind !== 'reversal' && entry.kind !== 'budget_switch';
  const canEdit = open && isEditable(entry);
  const confirm: Confirm =
    entry.id === cycleOpenedBy
      ? 'paycheck'
      : entry.kind === 'opening'
        ? 'opening'
        : null;

  const facts: [string, string][] = [
    [t('ledger.entry.date'), formatLongDay(entry.occurredOn, locale)],
    ...(category === null
      ? []
      : [
          [
            t('ledger.entry.category'),
            parent == null
              ? category.name
              : `${parent.name} / ${category.name}`,
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
    ...(rate === null || entry.impliedRate === null
      ? []
      : [
          [
            t('ledger.entry.rate'),
            t('ledger.entry.rateValue', { ...rate, rate: entry.impliedRate }),
          ] as [string, string],
        ]),
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
            <dt className="text-sm text-muted-foreground">{term}</dt>
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
            <tr className="border-b border-border text-muted-foreground">
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
              <tr key={index} className="border-b border-border last:border-0">
                <td className="py-1.5">
                  {p.systemRole === null
                    ? (accountOf.get(p.accountId)?.name ?? '')
                    : t(`ledger.entry.roles.${p.systemRole}`, {
                        currency: p.amount.currency,
                      })}
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
        <p className="text-muted-foreground">{t('ledger.entry.archived')}</p>
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
              variant="outline"
              aria-expanded={confirm === null ? undefined : confirming}
              aria-controls={
                confirm !== null && confirming ? confirmId : undefined
              }
              disabled={undo.isPending}
              onClick={() => {
                if (confirm === null) undo.mutate(entry.id);
                else setConfirming(true);
              }}
            >
              <Undo2 aria-hidden />
              {undo.isPending
                ? t('ledger.entry.undoing')
                : t('ledger.entry.undo')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {confirming && confirm !== null && canUndo ? (
        <div id={confirmId} className="grid gap-3 rounded-md bg-plot p-4">
          <p>
            {confirm === 'paycheck'
              ? t('ledger.entry.confirmPaycheck')
              : t('ledger.entry.confirmOpening')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={confirmButton}
              size="sm"
              disabled={undo.isPending}
              onClick={() => {
                undo.mutate(entry.id);
              }}
            >
              {undo.isPending
                ? t('ledger.entry.undoing')
                : t('ledger.entry.confirmUndo')}
            </Button>
            <Button
              variant="outline"
              size="sm"
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
  onEditingChange,
  onSavingChange,
  onEdited,
  onAnnounce,
}: {
  id: string;
  search: LedgerSearch;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSavingChange: (saving: boolean) => void;
  onEdited: (replacementId: string) => void;
  onAnnounce: (message: string) => void;
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
      <p role="status" className="mt-6 text-muted-foreground">
        {t('ledger.entry.loading')}
      </p>
    );

  const { locale, timeZone } = settings.data;
  const view = entry.data;
  if (editing && isEditable(view))
    return (
      <>
        <QuickEntryForm
          accounts={accounts.data.accounts.filter((a) => !a.archived)}
          categories={categories.data.categories}
          tags={tags.data.tags}
          locale={locale}
          today={today.data.today}
          edit={{ id: view.id, draft: draftFromEntry(view, locale) }}
          onSavingChange={onSavingChange}
          onSaved={(_message, replacementId) => {
            onEdited(replacementId);
          }}
        />
        <Button
          variant="ghost"
          className="mt-2 w-full"
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
      onUndone={() => {
        onAnnounce(t('ledger.entry.undoneAnnounce'));
      }}
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
export function EntryDialog({
  id,
  search,
  onClose,
  onShow,
}: {
  id: string | undefined;
  search: LedgerSearch;
  onClose: () => void;
  /** Shows another entry in the dialog, replacing the history step. */
  onShow: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  const content = useRef<HTMLDivElement>(null);
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

  const heading = editing
    ? t('ledger.entry.editTitle')
    : titleOf(entry.data, accounts.data?.accounts, categories.data?.categories);

  return (
    <Dialog.Root
      open={id !== undefined}
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content
          ref={content}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            title.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            setAnnouncement('');
            const row =
              id === undefined
                ? null
                : document.querySelector<HTMLElement>(
                    `[data-entry-id="${CSS.escape(id)}"]`,
                  );
            (row ?? document.querySelector<HTMLElement>('main h1'))?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-40 max-h-[90dvh] overflow-y-auto rounded-t-lg border bg-background p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lg outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg"
        >
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title
              ref={title}
              tabIndex={-1}
              className="text-xl font-semibold outline-none"
            >
              {heading}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('ledger.entry.close')}
                disabled={saving}
              >
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
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
              onAnnounce={(message) => {
                setAnnouncement(message);
                title.current?.focus();
              }}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
