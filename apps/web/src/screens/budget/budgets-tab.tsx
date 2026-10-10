import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { BudgetStatusView, BudgetView } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { Bar, SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Grid, Stack, Tile } from '@/components/layout';
import { MenuButton, MenuItem } from '@/components/menu';
import { Row, TreeRow } from '@/components/row';
import { CategoryIcon, EmptyState } from '@/components/states';
import { IconMore2Line } from '@/generated/icons';
import { canDelete } from '@/features/budget/budget-draft';
import { budgetsQuery } from '@/lib/budgets';
import { categoriesQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { CycleAllocationTile } from '../dashboard/tiles/cycle-allocation.tsx';
import { TileFailed } from '../dashboard/tiles/tile-failed.tsx';
import { BudgetConfirmSheet } from './budget-confirm-sheet.tsx';
import { BudgetSheet, type BudgetSheetMode } from './budget-sheet.tsx';
import {
  budgetTree,
  freeCategories,
  subCandidates,
  visibleEntries,
  type TreeEntry,
} from './budgets-model.ts';

const columns = [
  { width: 'minmax(0,1fr)' },
  { width: '6rem', from: 'medium' },
  { width: '5rem', from: 'medium' },
  { width: '5.5rem' },
  { width: '3.5rem', from: 'wide' },
  { width: '2rem' },
] as const;

type Open =
  | Readonly<{ sheet: BudgetSheetMode }>
  | Readonly<{ confirm: 'end' | 'delete'; budget: BudgetView }>;

// Budgets (docs/ui.md §6): the cycle allocation, the budget tree and who
// covered overspending this period. Every figure is the server's; the tree
// only groups budgets under their parent category.
export function BudgetsTab() {
  const status = useQuery(budgetsQuery);
  const categories = useQuery(categoriesQuery);
  const [open, setOpen] = useState<Open | null>(null);

  if (status.isError) {
    return (
      <Stack className="h-full">
        <Tile title={t('budgetBudgets.tree.title')}>
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
        <SkeletonTile span="full" />
        <SkeletonTile span={2} rows={5} />
        <SkeletonTile rows={4} />
      </Grid>
    );
  }
  const data = status.data;
  const cats = categories.data?.categories ?? [];
  return (
    <>
      <Grid>
        <CycleAllocationTile />
        <TreeTile data={data} categories={cats} onOpen={setOpen} />
        <CoverTile data={data} />
      </Grid>
      {open === null ? null : 'sheet' in open ? (
        <BudgetSheet
          mode={open.sheet}
          currency={data.available.currency}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : (
        <BudgetConfirmSheet
          action={open.confirm}
          budget={open.budget}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

function TreeTile({
  data,
  categories,
  onOpen,
}: {
  data: BudgetStatusView;
  categories: Parameters<typeof budgetTree>[1];
  onOpen: (open: Open) => void;
}) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const entries = useMemo(
    () => budgetTree(data.budgets, categories),
    [data.budgets, categories],
  );
  const shown = visibleEntries(entries, folded);
  const toggle = (group: string) => {
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });
  };
  return (
    <Tile
      title={t('budgetBudgets.tree.title')}
      subtitle={t('budgetBudgets.tree.subtitle')}
      span={2}
      bodyClassName="px-0 pb-0"
      actions={
        <BracketButton
          onPress={() => {
            onOpen({
              sheet: {
                kind: 'create',
                categories: freeCategories(data.budgets, categories),
              },
            });
          }}
        >
          {t('budgetBudgets.tree.add')}
        </BracketButton>
      }
    >
      {entries.length === 0 ? (
        <EmptyState
          title={t('budgetBudgets.tree.emptyTitle')}
          hint={t('budgetBudgets.tree.emptyHint')}
        />
      ) : (
        <>
          {shown.map((entry) => (
            <BudgetRow
              key={entry.key}
              entry={entry}
              folded={folded.has(entry.group)}
              onToggle={() => {
                toggle(entry.group);
              }}
              subs={
                entry.budget === null
                  ? []
                  : subCandidates(entry.budget, data.budgets, categories)
              }
              onOpen={onOpen}
            />
          ))}
          <Totals data={data} />
        </>
      )}
    </Tile>
  );
}

function BudgetRow({
  entry,
  folded,
  onToggle,
  subs,
  onOpen,
}: {
  entry: TreeEntry;
  folded: boolean;
  onToggle: () => void;
  subs: Parameters<typeof budgetTree>[1];
  onOpen: (open: Open) => void;
}) {
  const { budget } = entry;
  const name = (
    <span className="flex min-w-0 items-center gap-2">
      {entry.icon === null ? null : (
        <CategoryIcon name={entry.icon} color={entry.colour} />
      )}
      <span className="truncate font-sans">{entry.name}</span>
    </span>
  );
  const addSub =
    budget !== null && subs.length > 0
      ? () => {
          onOpen({
            sheet: { kind: 'sub', parent: budget, categories: subs },
          });
        }
      : undefined;
  const cells =
    budget === null
      ? [name, null, null, null, null, null]
      : [
          name,
          <Bar
            key="bar"
            value={entry.fraction}
            over={entry.over}
            label={t('budgetBudgets.tree.barLabel', { name: entry.name })}
          />,
          <Amount key="spent" amount={budget.spent} />,
          <Amount key="left" amount={budget.left} />,
          addSub === undefined ? null : (
            <BracketButton
              key="sub"
              aria-label={t('budgetBudgets.tree.addSubOf', {
                name: entry.name,
              })}
              onPress={addSub}
            >
              {t('budgetBudgets.tree.addSub')}
            </BracketButton>
          ),
          <RowMenu
            key="menu"
            budget={budget}
            onOpen={onOpen}
            {...(addSub === undefined ? {} : { addSub })}
          />,
        ];
  if (entry.role === 'flat') {
    return (
      <Row
        columns={[{ width: '1.5rem' }, ...columns]}
        cells={[null, ...cells]}
      />
    );
  }
  return (
    <TreeRow
      role={entry.role}
      expanded={!folded}
      onToggle={onToggle}
      label={t('budgetBudgets.tree.fold', { name: entry.name })}
      columns={columns}
      cells={cells}
    />
  );
}

function RowMenu({
  budget,
  addSub,
  onOpen,
}: {
  budget: BudgetView;
  addSub?: () => void;
  onOpen: (open: Open) => void;
}) {
  const { data } = useQuery(budgetsQuery);
  const periodFrom = data?.period.from ?? '';
  const buffer = budget.target.kind === 'buffer';
  return (
    <MenuButton
      iconOnly
      icon={IconMore2Line}
      label={t('budgetBudgets.tree.actionsOf', { name: budget.name })}
      title={budget.name}
      className="size-8 justify-center"
    >
      <MenuItem
        id="edit"
        label={t('budgetBudgets.menu.edit')}
        onAction={() => {
          onOpen({ sheet: { kind: 'edit', budget } });
        }}
      />
      {addSub === undefined ? null : (
        <MenuItem
          id="sub"
          label={t('budgetBudgets.menu.addSub')}
          onAction={addSub}
        />
      )}
      {buffer ? null : (
        <MenuItem
          id="end"
          label={t('budgetBudgets.menu.end')}
          onAction={() => {
            onOpen({ confirm: 'end', budget });
          }}
        />
      )}
      {canDelete(budget, periodFrom) ? (
        <MenuItem
          id="delete"
          destructive
          label={t('budgetBudgets.menu.delete')}
          onAction={() => {
            onOpen({ confirm: 'delete', budget });
          }}
        />
      ) : null}
    </MenuButton>
  );
}

const totalColumns = [{ width: 'minmax(0,1fr)' }, { width: '7rem' }] as const;

/** The server's own totals; the browser adds nothing up. */
function Totals({ data }: { data: BudgetStatusView }) {
  const lines = [
    ['daily', t('budgetBudgets.tree.totalDaily'), data.dailyLeft],
    ['held', t('budgetBudgets.tree.totalHeld'), data.held],
    ['unbudgeted', t('budgetBudgets.tree.totalUnbudgeted'), data.unbudgeted],
    ['free', t('budgetBudgets.tree.totalFree'), data.free],
  ] as const;
  return (
    <div className="bg-chrome">
      {lines.map(([id, label, amount]) => (
        <Row
          key={id}
          columns={totalColumns}
          cells={[
            <strong key="l" className="font-semibold">
              {label}
            </strong>,
            <Amount key="a" amount={amount} />,
          ]}
        />
      ))}
    </div>
  );
}

const coverColumns = [{ width: 'minmax(0,1fr)' }, { width: '7rem' }] as const;

function CoverTile({ data }: { data: BudgetStatusView }) {
  const { covered, coverOrder } = data;
  const next = coverOrder[0];
  const lines = [
    ['shortfall', t('budgetBudgets.cover.shortfall'), covered.shortfall],
    ['free', t('budgetBudgets.cover.fromFree'), covered.fromFree],
    ['buffer', t('budgetBudgets.cover.fromBuffer'), covered.fromBuffer],
    ['budgets', t('budgetBudgets.cover.fromBudgets'), covered.fromBudgets],
    ['uncovered', t('budgetBudgets.cover.uncovered'), covered.uncovered],
  ] as const;
  return (
    <Tile
      title={t('budgetBudgets.cover.title')}
      subtitle={t('budgetBudgets.cover.subtitle')}
      bodyClassName="px-0 pb-0"
      actions={
        <Link
          to="/budget/$sub"
          params={{ sub: 'cover-order' }}
          className="press inline-flex h-8 min-w-8 items-center justify-center px-1 text-small text-primary"
        >
          {t('budgetBudgets.cover.order')}
        </Link>
      }
    >
      {covered.shortfall.amountMinor <= 0 ? (
        <p className="px-3 py-2 font-sans text-small text-text-muted">
          {t('budgetBudgets.cover.none')}
        </p>
      ) : (
        lines.map(([id, label, amount]) => (
          <Row
            key={id}
            columns={coverColumns}
            cells={[label, <Amount key="a" amount={amount} />]}
          />
        ))
      )}
      {next === undefined ? null : (
        <Row
          columns={coverColumns}
          cells={[
            t('budgetBudgets.cover.nextTitle'),
            <span key="n" className="font-sans">
              {next.name}
            </span>,
          ]}
        />
      )}
    </Tile>
  );
}
