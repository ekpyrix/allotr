import {
  useMutation,
  useQuery,
  useQueryClient,
  queryOptions,
} from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import type { CategoryView, Money, TransactionView } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { Bar, SkeletonTile } from '@/components/bars';
import { BracketButton, Tag } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { CategoryIcon } from '@/components/states';
import {
  IconCloseLine,
  IconDeleteBinLine,
  IconEditLine,
  IconHistoryLine,
  IconMoneyDollarCircleLine,
  IconScissorsCutLine,
} from '@/generated/icons';
import { formatLongDay, rateText } from '@/features/ledger/format';
import { ledgerRows } from '@/features/ledger/rows';
import { isEditable } from '@/features/ledger/edit-draft';
import { call } from '@/lib/api';
import { budgetsQuery, coversQuery } from '@/lib/budgets';
import { spentShare } from '@/features/budget/share';
import { seriesNumber } from '@/lib/category-style';
import { endpoints } from '@/lib/endpoints';
import {
  allAccountsQuery,
  allCategoriesQuery,
  entryQuery,
  entryQueryKeys,
  restoreTransaction,
  reverseTransaction,
  revertTransaction,
} from '@/lib/ledger';
import { formatMoney } from '@/lib/format-money';
import { t } from '@/messages/t';
import { CoverSheet } from './cover-sheet.tsx';
import {
  budgetFor,
  coverParts,
  entryDetail,
  isCovered,
  type EntryDetailModel,
} from './detail-model.ts';
import { EditSheet } from './edit-sheet.tsx';

const locale = 'en';

/**
 * One entry in full (docs/ui.md §6): what it is, its budget and cover, its
 * history and other entries from the same payee, then the actions. The list
 * renders it in the pane (≥ 1000 px) or in a sheet and owns the selection;
 * `onOpen` selects another entry (a version, a copy, the edited entry).
 */
export function EntryDetail({
  entryId,
  onClose,
  onOpen,
}: {
  entryId: string;
  onClose: () => void;
  onOpen?: (id: string) => void;
}) {
  const entry = useQuery(entryQuery(entryId));
  const accounts = useQuery(allAccountsQuery);
  const categories = useQuery(allCategoriesQuery);

  const closeButton = (
    <Button
      aria-label={t('transactionDetail.close')}
      onPress={onClose}
      className="press flex size-hit items-center justify-center"
    >
      <IconCloseLine className="size-4" />
    </Button>
  );

  if (entry.isError || accounts.isError || categories.isError) {
    return (
      <Tile title={t('transactionDetail.title')} actions={closeButton}>
        <div role="alert" className="flex flex-col items-start gap-2 py-3">
          <p className="text-small">{t('transactionDetail.failed')}</p>
          <BracketButton
            onPress={() => {
              void entry.refetch();
              void accounts.refetch();
              void categories.refetch();
            }}
          >
            {t('transactionDetail.retry')}
          </BracketButton>
        </div>
      </Tile>
    );
  }
  if (
    entry.data === undefined ||
    accounts.data === undefined ||
    categories.data === undefined
  ) {
    return <SkeletonTile />;
  }

  const model = entryDetail(
    entry.data,
    accounts.data.accounts,
    categories.data.categories,
  );
  return (
    <DetailBody
      entry={entry.data}
      model={model}
      categories={categories.data.categories}
      closeButton={closeButton}
      onOpen={onOpen ?? onClose}
    />
  );
}

function DetailBody({
  entry,
  model,
  categories,
  closeButton,
  onOpen,
}: {
  entry: TransactionView;
  model: EntryDetailModel;
  categories: readonly CategoryView[];
  closeButton: ReactNode;
  onOpen: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<'edit' | 'split' | 'cover' | null>(null);
  const { row } = model;
  const refresh = () => {
    for (const queryKey of entryQueryKeys)
      void queryClient.invalidateQueries({ queryKey });
  };
  const remove = useMutation({
    mutationFn: () => reverseTransaction(entry.id),
    onSuccess: refresh,
  });
  const covers = useQuery(coversQuery);
  // Only an entry that went past its budget has a cover to choose.
  const covered =
    covers.data?.covers.some((c) => c.entryId === entry.id) ?? false;
  const restore = useMutation({
    mutationFn: () => restoreTransaction(entry.id),
    onSuccess: (copy) => {
      refresh();
      onOpen(copy.id);
    },
  });

  const style = row.style;
  const colour = style === null ? undefined : seriesNumber(style.colour);
  const title = model.payee ?? row.title ?? t(`ledger.kinds.${entry.kind}`);
  const amountKind =
    row.moves || row.amount === null
      ? 'transfer'
      : row.amount.amountMinor < 0
        ? 'expense'
        : 'income';
  const rate = rateText(entry);
  const editable = isEditable(entry);

  return (
    <Tile
      title={t('transactionDetail.title')}
      subtitle={formatLongDay(entry.occurredOn, locale)}
      actions={closeButton}
      bodyClassName="px-0 pb-0"
    >
      <section
        aria-label={title}
        className="flex flex-col gap-1 border-b px-3 pb-3"
      >
        <div className="flex items-center gap-2">
          {style?.icon == null ? (
            <IconMoneyDollarCircleLine className="size-5 shrink-0 text-text-muted" />
          ) : (
            <CategoryIcon
              name={style.icon}
              {...(colour === undefined ? {} : { color: colour })}
              className="size-5"
            />
          )}
          <h3 className="min-w-0 flex-1 truncate font-sans text-base font-semibold">
            {model.payee ?? t('transactionDetail.noPayee')}
          </h3>
          {model.deleted ? (
            <Tag tone="negative">{t('transactionDetail.tags.deleted')}</Tag>
          ) : null}
          {model.edited ? (
            <Tag>{t('transactionDetail.tags.edited')}</Tag>
          ) : null}
        </div>
        {row.amount === null ? null : (
          <p className="text-xl font-semibold">
            <Amount amount={row.amount} kind={amountKind} locale={locale} />
          </p>
        )}
      </section>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b px-3 py-2 text-small">
        <Field label={t('transactionDetail.fields.date')}>
          {formatLongDay(entry.occurredOn, locale)}
          {entry.occurredTime === null ? '' : ` ${entry.occurredTime}`}
        </Field>
        <Field label={t('transactionDetail.fields.category')}>
          {model.categoryPath ?? t('transactionDetail.fields.noCategory')}
        </Field>
        <Field
          label={
            model.accounts.length > 1
              ? t('transactionDetail.fields.accounts')
              : t('transactionDetail.fields.account')
          }
        >
          {model.accounts.join(' → ')}
        </Field>
        {rate === null ? null : <Field label="">{rate}</Field>}
        <Field label={t('transactionDetail.fields.source')}>
          {t(`transactionDetail.sources.${entry.source}`)}
        </Field>
      </dl>

      {model.canCover ? (
        <BudgetAndCover entry={entry} categories={categories} />
      ) : null}

      <History entry={entry} onOpen={onOpen} onChanged={refresh} />

      {model.payee === null || entry.kind !== 'expense' ? null : (
        <SamePayee
          payee={model.payee}
          entryId={entry.id}
          categories={categories}
          onOpen={onOpen}
        />
      )}

      <div className="flex flex-wrap items-center gap-1 px-3 py-2">
        {model.canEdit ? (
          <BracketButton
            icon={IconEditLine}
            onPress={() => {
              setSheet('edit');
            }}
          >
            {t('transactionDetail.actions.edit')}
          </BracketButton>
        ) : null}
        {model.canSplit ? (
          <BracketButton
            icon={IconScissorsCutLine}
            onPress={() => {
              setSheet('split');
            }}
          >
            {t('transactionDetail.actions.split')}
          </BracketButton>
        ) : null}
        {model.canCover && covered ? (
          <BracketButton
            onPress={() => {
              setSheet('cover');
            }}
          >
            {t('transactionDetail.actions.cover')}
          </BracketButton>
        ) : null}
        {model.canDelete ? (
          <BracketButton
            tone="destructive"
            icon={IconDeleteBinLine}
            isDisabled={remove.isPending}
            onPress={() => {
              remove.mutate();
            }}
          >
            {t('transactionDetail.actions.delete')}
          </BracketButton>
        ) : null}
        {model.canRestore ? (
          <BracketButton
            isDisabled={restore.isPending}
            onPress={() => {
              restore.mutate();
            }}
          >
            {t('transactionDetail.actions.restore')}
          </BracketButton>
        ) : null}
      </div>
      {remove.isSuccess && model.deleted ? (
        <p role="status" className="px-3 pb-2 text-small text-text-muted">
          {t('transactionDetail.deleted')}
        </p>
      ) : null}
      {remove.isError || restore.isError ? (
        <p role="alert" className="px-3 pb-2 text-small text-negative">
          {t('transactionDetail.actionFailed')}
        </p>
      ) : null}

      {(sheet === 'edit' || sheet === 'split') && editable ? (
        <EditSheet
          entry={entry}
          split={sheet === 'split'}
          onClose={() => {
            setSheet(null);
          }}
          onSaved={(id) => {
            setSheet(null);
            onOpen(id);
          }}
        />
      ) : null}
      {sheet === 'cover' ? (
        <CoverSheetLoader
          entryId={entry.id}
          onClose={() => {
            setSheet(null);
          }}
        />
      ) : null}
    </Tile>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate font-sans">{children}</dd>
    </>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-tiny font-semibold tracking-wide text-text-muted uppercase">
      {children}
    </h3>
  );
}

/** The budget that counted the entry, as it stands now, and who covered it. */
function BudgetAndCover({
  entry,
  categories,
}: {
  entry: TransactionView;
  categories: readonly CategoryView[];
}) {
  const covers = useQuery(coversQuery);
  const budgets = useQuery(budgetsQuery);
  if (covers.data === undefined || budgets.data === undefined) return null;

  // The cover list holds only entries that went past their budget, this
  // period; for any other entry its own budget paid all of it.
  const line = covers.data.covers.find((c) => c.entryId === entry.id);
  const budget = budgetFor(
    entry,
    line,
    budgets.data.budgets,
    categories,
    budgets.data.period,
  );
  if (budget === undefined && line === undefined) return null;

  return (
    <>
      <section
        aria-label={t('transactionDetail.budget.title')}
        className="flex flex-col gap-1 border-b px-3 py-2"
      >
        <SectionTitle>{t('transactionDetail.budget.title')}</SectionTitle>
        {budget === undefined ? (
          <p className="text-small text-text-muted">
            {t('transactionDetail.budget.none')}
          </p>
        ) : (
          <>
            <p className="font-sans text-small">
              {budget.name}{' '}
              <span className="font-num text-text-muted">
                {t('transactionDetail.budget.left', {
                  left: formatMoney(budget.left, 'symbol', locale),
                  planned: formatMoney(budget.planned, 'symbol', locale),
                })}
              </span>
            </p>
            <Bar
              value={spentShare(budget.spent, budget.left) / 100}
              over={line !== undefined && line.uncovered.amountMinor > 0}
              label={t('transactionDetail.budget.bar', { name: budget.name })}
            />
            <p className="text-tiny text-text-muted">
              {t('transactionDetail.budget.note')}
            </p>
          </>
        )}
      </section>
      <section
        aria-label={t('transactionDetail.cover.title')}
        className="flex flex-col gap-0.5 border-b px-3 py-2 text-small"
      >
        <SectionTitle>{t('transactionDetail.cover.title')}</SectionTitle>
        {line !== undefined && isCovered(line) ? (
          <>
            <CoverText money={line.own} message="own" />
            {coverParts(line).map((c) => (
              <p key={c.source}>
                {t('transactionDetail.cover.from', {
                  name: c.name,
                  amount: formatMoney(c.amount, 'symbol', locale),
                })}
              </p>
            ))}
            {line.uncovered.amountMinor === 0 ? null : (
              <p className="text-negative">
                {t('transactionDetail.cover.uncovered', {
                  amount: formatMoney(line.uncovered, 'symbol', locale),
                })}
              </p>
            )}
            {line.overridden ? (
              <p className="text-text-muted">
                {t('transactionDetail.cover.chosen')}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-text-muted">{t('transactionDetail.cover.none')}</p>
        )}
      </section>
    </>
  );
}

function CoverText({ money, message }: { money: Money; message: 'own' }) {
  return (
    <p>
      {t(`transactionDetail.cover.${message}`, {
        amount: formatMoney(money, 'symbol', locale),
      })}
    </p>
  );
}

function CoverSheetLoader({
  entryId,
  onClose,
}: {
  entryId: string;
  onClose: () => void;
}) {
  const covers = useQuery(coversQuery);
  const budgets = useQuery(budgetsQuery);
  const line = covers.data?.covers.find((c) => c.entryId === entryId);
  if (line === undefined || budgets.data === undefined) return null;
  return (
    <CoverSheet
      entryId={entryId}
      line={line}
      order={budgets.data.coverOrder}
      onClose={onClose}
    />
  );
}

/**
 * The versions an edit left behind, newest first, each followed by the one it
 * replaced; and what became of this entry if it was deleted or replaced.
 */
function History({
  entry,
  onOpen,
  onChanged,
}: {
  entry: TransactionView;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const hasHistory =
    entry.replacesId !== null ||
    entry.replacedById !== null ||
    entry.reversedById !== null ||
    entry.restoredById !== null;
  if (!hasHistory) return null;
  return (
    <section
      aria-label={t('transactionDetail.history.title')}
      className="flex flex-col border-b py-2"
    >
      <div className="flex items-center gap-1 px-3 pb-1">
        <IconHistoryLine className="size-3.5 text-text-muted" />
        <SectionTitle>{t('transactionDetail.history.title')}</SectionTitle>
      </div>
      {entry.replacedById === null ? null : (
        <LinkRow
          label={t('transactionDetail.tags.edited')}
          open={t('transactionDetail.history.open')}
          onPress={() => {
            onOpen(entry.replacedById ?? '');
          }}
        />
      )}
      {entry.reversedById === null ? null : (
        <LinkRow
          label={t('transactionDetail.history.deletedBy')}
          open={t('transactionDetail.history.open')}
          onPress={() => {
            onOpen(entry.reversedById ?? '');
          }}
        />
      )}
      {entry.restoredById === null ? null : (
        <LinkRow
          label={t('transactionDetail.history.restoredAs')}
          open={t('transactionDetail.history.open')}
          onPress={() => {
            onOpen(entry.restoredById ?? '');
          }}
        />
      )}
      {entry.replacesId === null ? null : (
        <Version
          id={entry.replacesId}
          n={1}
          current={entry.replacedById === null}
          onOpen={onOpen}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}

function LinkRow({
  label,
  open,
  onPress,
}: {
  label: string;
  open: string;
  onPress: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 text-small">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <BracketButton onPress={onPress}>{open}</BracketButton>
    </div>
  );
}

const versionColumns: readonly RowColumn[] = [
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
  { width: 'auto' },
];

/** One earlier version, and (below it) the one it replaced. */
function Version({
  id,
  n,
  current,
  onOpen,
  onChanged,
}: {
  id: string;
  n: number;
  /** The entry on screen is the newest version, so reverting is allowed. */
  current: boolean;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const version = useQuery(entryQuery(id));
  const accounts = useQuery(allAccountsQuery);
  const categories = useQuery(allCategoriesQuery);
  const revert = useMutation({
    mutationFn: () => revertTransaction(id),
    onSuccess: (edited) => {
      onChanged();
      onOpen(edited.replacement.id);
    },
  });
  if (
    version.data === undefined ||
    accounts.data === undefined ||
    categories.data === undefined
  )
    return null;
  const [row] = ledgerRows(
    [version.data],
    accounts.data.accounts,
    categories.data.categories,
  );
  return (
    <>
      <Row
        columns={versionColumns}
        cells={[
          <span key="when" className="font-sans">
            {t('transactionDetail.history.version', { n })} ·{' '}
            {formatLongDay(version.data.occurredOn, locale)}
          </span>,
          row?.amount == null ? null : (
            <Amount
              key="amount"
              amount={row.amount}
              kind={row.moves ? 'transfer' : 'plain'}
              locale={locale}
            />
          ),
          current ? (
            <BracketButton
              key="revert"
              isDisabled={revert.isPending}
              onPress={() => {
                revert.mutate();
              }}
            >
              {t('transactionDetail.history.revert')}
            </BracketButton>
          ) : null,
        ]}
      />
      {version.data.replacesId === null ? null : (
        <Version
          id={version.data.replacesId}
          n={n + 1}
          current={current}
          onOpen={onOpen}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

const SAME_PAYEE_SHOWN = 5;

// Other entries from the payee: the report's own match (`payee` with
// `type=expense` and `undone=hide`), newest first, no period.
function samePayeeQuery(payee: string) {
  return queryOptions({
    queryKey: ['transactions', 'payee', payee],
    queryFn: () =>
      call(endpoints.transactions, {
        query: {
          payee,
          type: 'expense',
          undone: 'hide',
          limit: SAME_PAYEE_SHOWN + 1,
        },
      }),
  });
}

const payeeColumns: readonly RowColumn[] = [
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
];

function SamePayee({
  payee,
  entryId,
  categories,
  onOpen,
}: {
  payee: string;
  entryId: string;
  categories: readonly CategoryView[];
  onOpen: (id: string) => void;
}) {
  const others = useQuery(samePayeeQuery(payee));
  const accounts = useQuery(allAccountsQuery);
  if (others.data === undefined || accounts.data === undefined) return null;
  const rows = ledgerRows(
    others.data.transactions.filter((e) => e.id !== entryId),
    accounts.data.accounts,
    categories,
  ).slice(0, SAME_PAYEE_SHOWN);
  return (
    <section
      aria-label={t('transactionDetail.payee.title')}
      className="flex flex-col border-b py-2"
    >
      <div className="px-3 pb-1">
        <SectionTitle>{t('transactionDetail.payee.title')}</SectionTitle>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 text-small text-text-muted">
          {t('transactionDetail.payee.empty')}
        </p>
      ) : (
        rows.map((other) => (
          <Row
            key={other.id}
            columns={payeeColumns}
            onPress={() => {
              onOpen(other.id);
            }}
            cells={[
              <span key="day" className="font-sans">
                {formatLongDay(other.occurredOn, locale)}
              </span>,
              other.amount === null ? null : (
                <Amount
                  key="amount"
                  amount={other.amount}
                  kind="expense"
                  locale={locale}
                />
              ),
            ]}
          />
        ))
      )}
    </section>
  );
}
