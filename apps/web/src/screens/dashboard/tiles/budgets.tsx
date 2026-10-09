import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Amount } from '@/components/amount';
import { Bar, SkeletonTile } from '@/components/bars';
import { Tile } from '@/components/layout';
import { Row } from '@/components/row';
import { CategoryIcon, EmptyState } from '@/components/states';
import { budgetsQuery } from '@/lib/budgets';
import { categoriesQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';
import { budgetRows } from './budgets.ts';

const columns = [
  { width: 'minmax(0,1fr)' },
  { width: '5rem', from: 'medium' },
  { width: '5.5rem' },
] as const;

export function BudgetsTile() {
  const budgets = useQuery(budgetsQuery);
  const categories = useQuery(categoriesQuery);
  const title = t('dashboardTiles.budgets.title');
  if (budgets.isError) {
    return (
      <Tile title={title}>
        <TileFailed
          retry={() => {
            void budgets.refetch();
          }}
        />
      </Tile>
    );
  }
  if (budgets.data === undefined) return <SkeletonTile rows={4} />;
  const rows = budgetRows(
    budgets.data.budgets,
    categories.data?.categories ?? [],
  );
  return (
    <Tile
      title={title}
      subtitle={t('dashboardTiles.budgets.subtitle')}
      actions={
        <Link
          to="/budget/$sub"
          params={{ sub: 'budgets' }}
          className="press inline-flex h-8 min-w-8 items-center justify-center px-1 text-small text-primary"
        >
          {t('dashboardTiles.budgets.all')}
        </Link>
      }
      bodyClassName="px-0 pb-0"
    >
      {rows.length === 0 ? (
        <EmptyState
          title={t('dashboardTiles.budgets.emptyTitle')}
          hint={t('dashboardTiles.budgets.emptyHint')}
        />
      ) : (
        rows.map((row) => (
          <Row
            key={row.id}
            columns={columns}
            cells={[
              <span key="n" className="flex min-w-0 items-center gap-2">
                {row.icon === null ? null : (
                  <CategoryIcon name={row.icon} color={row.colour} />
                )}
                <span className="truncate font-sans">{row.name}</span>
              </span>,
              <Bar
                key="b"
                value={row.fraction}
                over={row.over}
                label={t('dashboardTiles.budgets.barLabel', {
                  name: row.name,
                })}
              />,
              <span key="l" className="flex flex-col items-end leading-tight">
                <Amount amount={row.left} />
                <span className="text-tiny text-text-muted">
                  {t('dashboardTiles.budgets.left')}
                </span>
              </span>,
            ]}
          />
        ))
      )}
    </Tile>
  );
}
