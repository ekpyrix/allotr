import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { GridList, GridListItem, useDragAndDrop } from 'react-aria-components';
import type { BudgetStatusView, CoverPreviewView } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Grid, Stack, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import { EmptyState } from '@/components/states';
import { moveItem } from '@/features/budget/order';
import { useCoverPreview } from '@/features/budget/cover-preview';
import { budgetQueryKeys, budgetsQuery, setCoverOrder } from '@/lib/budgets';
import { accountsQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { TileFailed } from '../dashboard/tiles/tile-failed.tsx';
import { ChoiceField, TextField } from '../transactions/detail/fields.tsx';
import { previewRequest, reorder } from './cover-order-model.ts';

// Cover order (docs/ui.md §6): who pays first when a budget overspends, as
// a list you reorder by dragging a row or with ↑ ↓, and a preview that asks
// the server where an overspend would take its money from.
export function CoverOrderTab() {
  const status = useQuery(budgetsQuery);
  if (status.isError) {
    return (
      <Stack className="h-full">
        <Tile title={t('budgetBudgets.order.title')}>
          <TileFailed
            retry={() => {
              void status.refetch();
            }}
          />
        </Tile>
      </Stack>
    );
  }
  if (status.data === undefined) {
    return (
      <Grid>
        <SkeletonTile rows={5} />
        <SkeletonTile span={2} rows={5} />
      </Grid>
    );
  }
  return (
    <Grid>
      <OrderTile data={status.data} />
      <NextTile data={status.data} />
    </Grid>
  );
}

function sourceName(item: BudgetStatusView['coverOrder'][number]): string {
  if (item.kind === 'free') return t('budgetBudgets.order.free');
  if (item.kind === 'buffer') return t('budgetBudgets.order.buffer');
  return item.name;
}

function OrderTile({ data }: { data: BudgetStatusView }) {
  const queryClient = useQueryClient();
  const server = data.coverOrder;
  // The order shown while a save is in flight, so a move feels instant.
  const [pending, setPending] = useState<readonly string[] | null>(null);
  const ids = pending ?? server.map((item) => item.id);
  const byId = new Map(server.map((item) => [item.id, item]));
  const save = useMutation({
    mutationFn: (order: readonly string[]) => setCoverOrder(order),
    onSettled: async () => {
      await Promise.all(
        budgetQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      setPending(null);
    },
  });
  const apply = (next: string[]) => {
    setPending(next);
    save.mutate(next);
  };
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onReorder: (event) => {
      const target = String(event.target.key);
      apply(
        reorder(
          ids,
          new Set([...event.keys].map(String)),
          target,
          event.target.dropPosition === 'before' ? 'before' : 'after',
        ),
      );
    },
  });
  return (
    <Tile
      title={t('budgetBudgets.order.title')}
      subtitle={t('budgetBudgets.order.subtitle')}
      bodyClassName="px-0 pb-0"
    >
      {ids.length === 0 ? (
        <EmptyState
          title={t('budgetBudgets.order.emptyTitle')}
          hint={t('budgetBudgets.order.emptyHint')}
        />
      ) : (
        <>
          <GridList
            aria-label={t('budgetBudgets.order.listLabel')}
            dragAndDropHooks={dragAndDropHooks}
            selectionMode="none"
          >
            {ids.map((id, index) => {
              const item = byId.get(id);
              if (item === undefined) return null;
              const name = sourceName(item);
              return (
                <GridListItem
                  key={id}
                  id={id}
                  textValue={name}
                  className="border-b outline-none focus-visible:bg-card data-[dragging]:bg-card data-[drop-target]:bg-card"
                >
                  <div className="flex min-h-row items-center gap-2 px-3">
                    <span className="num w-5 text-text-muted">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-sans">
                      {name}
                    </span>
                    <BracketButton
                      aria-label={t('budgetBudgets.order.up', { name })}
                      isDisabled={index === 0}
                      onPress={() => {
                        apply(moveItem(ids, index, index - 1));
                      }}
                    >
                      ↑
                    </BracketButton>
                    <BracketButton
                      aria-label={t('budgetBudgets.order.down', { name })}
                      isDisabled={index === ids.length - 1}
                      onPress={() => {
                        apply(moveItem(ids, index, index + 1));
                      }}
                    >
                      ↓
                    </BracketButton>
                  </div>
                </GridListItem>
              );
            })}
          </GridList>
          <p className="px-3 py-2 font-sans text-small text-text-muted">
            {t('budgetBudgets.order.hint')}
          </p>
          {save.isError ? (
            <p role="alert" className="px-3 pb-2 text-small text-negative">
              {t('budgetBudgets.order.saveFailed')}
            </p>
          ) : null}
        </>
      )}
    </Tile>
  );
}

const resultColumns = [{ width: 'minmax(0,1fr)' }, { width: '7rem' }] as const;

function NextTile({ data }: { data: BudgetStatusView }) {
  const accounts = useQuery(accountsQuery);
  const onBudget = (accounts.data?.accounts ?? []).filter(
    (a) => a.budgetGroup === 'on' && !a.archived,
  );
  const budgets = data.budgets.filter((b) => b.target.kind === 'category');
  const [budgetId, setBudgetId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const account = onBudget.find((a) => a.id === accountId);
  const request = previewRequest({
    budget: budgets.find((b) => b.id === budgetId),
    accountId,
    currency: account?.currency,
    amount,
  });
  const { preview, key } = useCoverPreview(request);
  const current =
    request !== null && key === JSON.stringify(request) ? preview : undefined;
  return (
    <Tile
      title={t('budgetBudgets.next.title')}
      subtitle={t('budgetBudgets.next.subtitle')}
      span={2}
      bodyClassName="px-0 pb-0"
    >
      {budgets.length === 0 ? (
        <EmptyState
          title={t('budgetBudgets.next.noBudgets')}
          hint={t('budgetBudgets.next.intro')}
        />
      ) : (
        <div className="flex flex-col gap-3 border-b p-3">
          <p className="font-sans text-small text-text-muted">
            {t('budgetBudgets.next.intro')}
          </p>
          <div className="grid grid-cols-1 gap-2 medium:grid-cols-3">
            <ChoiceField
              label={t('budgetBudgets.next.budget')}
              value={budgetId}
              choices={budgets.map((b) => ({ id: b.id, label: b.name }))}
              placeholder={t('budgetBudgets.next.budgetPick')}
              onChange={setBudgetId}
            />
            <ChoiceField
              label={t('budgetBudgets.next.account')}
              value={accountId}
              choices={onBudget.map((a) => ({ id: a.id, label: a.name }))}
              placeholder={t('budgetBudgets.next.accountPick')}
              onChange={setAccountId}
            />
            <TextField
              label={t('budgetBudgets.next.amount', {
                currency: account?.currency ?? '',
              })}
              value={amount}
              onChange={setAmount}
              inputMode="decimal"
            />
          </div>
        </div>
      )}
      {current === undefined ? null : <PreviewRows preview={current} />}
    </Tile>
  );
}

function PreviewRows({ preview }: { preview: CoverPreviewView }) {
  if (!preview.counted) {
    return (
      <p className="px-3 py-2 font-sans text-small text-text-muted">
        {t('budgetBudgets.next.notCounted')}
      </p>
    );
  }
  return (
    <div>
      <Row
        columns={resultColumns}
        cells={[
          t('budgetBudgets.next.own'),
          <Amount key="own" amount={preview.own} />,
        ]}
      />
      {preview.covers.map((cover) => (
        <Row
          key={cover.source}
          columns={resultColumns}
          cells={[
            <span key="n" className="font-sans">
              {cover.name}
            </span>,
            <Amount key="a" amount={cover.amount} />,
          ]}
        />
      ))}
      {preview.covers.length === 0 && !preview.overspend ? (
        <p className="px-3 py-2 font-sans text-small text-text-muted">
          {t('budgetBudgets.next.noOverspend')}
        </p>
      ) : null}
      {preview.uncovered.amountMinor > 0 ? (
        <Row
          columns={resultColumns}
          cells={[
            t('budgetBudgets.next.uncovered'),
            <Amount key="u" amount={preview.uncovered} />,
          ]}
        />
      ) : null}
      {preview.reachesSetAside ? (
        <p className="px-3 py-2 font-sans text-small text-text">
          {t('budgetBudgets.next.reachesSetAside')}
        </p>
      ) : null}
      <Row
        columns={resultColumns}
        cells={[
          t('budgetBudgets.next.leftToday'),
          <span key="l" className="flex items-center justify-end gap-1">
            <Amount amount={preview.leftToday.before} />
            <span aria-hidden="true">→</span>
            <Amount amount={preview.leftToday.after} />
          </span>,
        ]}
      />
    </div>
  );
}
