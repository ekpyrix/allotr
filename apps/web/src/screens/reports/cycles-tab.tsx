import { useQuery } from '@tanstack/react-query';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { BracketButton, Tag } from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import { EmptyState } from '@/components/states';
import { Columns } from '@/charts/columns';
import { cyclesQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import {
  cycleRows,
  recentCycles,
  savedColumns,
  spentColumns,
} from './cycles-model.ts';
import { PeriodMenu } from './period-menu.tsx';

const locale = 'en';

const columns = [
  { width: 'minmax(0,1fr)' },
  { width: '6.5rem', from: 'medium' },
  { width: '6.5rem' },
  { width: '6.5rem', from: 'medium' },
  { width: '4rem', from: 'wide' },
  { width: '5rem', from: 'wide' },
] as const;

// Cycles (docs/ui.md §6): what each cycle spent and saved, then the table of
// them. Every figure is the cycle snapshot the server sent. The period menu
// does not narrow it: comparing cycles needs several of them.
export function CyclesTab() {
  const cycles = useQuery(cyclesQuery);
  const list = cycles.data?.cycles;
  return (
    <>
      <PeriodMenu />
      {cycles.isError ? (
        <Grid>
          <Tile title={t('reportsPlan.cycles.table.title')} span="full">
            <div
              role="alert"
              className="flex items-center gap-2 py-2 text-small"
            >
              <span className="text-negative">
                {t('reportsPlan.loadFailed')}
              </span>
              <BracketButton
                onPress={() => {
                  void cycles.refetch();
                }}
              >
                {t('reportsPlan.retry')}
              </BracketButton>
            </div>
          </Tile>
        </Grid>
      ) : list === undefined ? (
        <Grid>
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile span="full" rows={5} />
        </Grid>
      ) : list.length === 0 ? (
        <Grid>
          <Tile title={t('reportsPlan.cycles.table.title')} span="full">
            <EmptyState
              title={t('reportsPlan.cycles.emptyTitle')}
              hint={t('reportsPlan.cycles.emptyHint')}
            />
          </Tile>
        </Grid>
      ) : (
        <Grid>
          <Tile
            title={t('reportsPlan.cycles.spent.title')}
            subtitle={t('reportsPlan.cycles.spent.subtitle')}
            bodyClassName="px-0"
          >
            <Columns
              label={t('reportsPlan.cycles.spent.summary')}
              data={spentColumns(recentCycles(list), locale)}
            />
          </Tile>
          <Tile
            title={t('reportsPlan.cycles.saved.title')}
            subtitle={t('reportsPlan.cycles.saved.subtitle')}
            bodyClassName="px-0"
          >
            <Columns
              label={t('reportsPlan.cycles.saved.summary')}
              data={savedColumns(recentCycles(list), locale)}
            />
          </Tile>
          <Tile
            title={t('reportsPlan.cycles.table.title')}
            subtitle={t('reportsPlan.cycles.table.subtitle')}
            span="full"
            bodyClassName="px-0 pb-0"
          >
            <Row
              className="text-small text-text-muted"
              columns={columns}
              cells={[
                t('reportsPlan.cycles.table.cycle'),
                t('reportsPlan.cycles.table.income'),
                t('reportsPlan.cycles.table.spent'),
                t('reportsPlan.cycles.table.saved'),
                t('reportsPlan.cycles.table.rate'),
                null,
              ]}
            />
            {cycleRows(list, locale).map((row) => (
              <Row
                key={row.key}
                columns={columns}
                cells={[
                  row.label,
                  <Amount key="i" amount={row.income} />,
                  <Amount key="s" amount={row.spent} />,
                  <Amount key="v" amount={row.saved} />,
                  row.rate ?? t('reportsPlan.rate.none'),
                  row.amended ? (
                    <Tag key="a" tone="warning">
                      {t('reportsPlan.cycles.table.amended')}
                    </Tag>
                  ) : null,
                ]}
              />
            ))}
          </Tile>
        </Grid>
      )}
    </>
  );
}
