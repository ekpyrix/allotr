import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { GoalView, LocalDate } from '@allotr/shared';
import { Chart } from '@/charts/chart';
import { Amount } from '@/components/amount';
import { Bar, SkeletonTile } from '@/components/bars';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { formatDay } from '@/features/today/format';
import { goalsQuery, poolQueryKeys, updateGoal } from '@/lib/budgets';
import { formatMoney } from '@/lib/format-money';
import { todayQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { barFraction } from '@/shell/summary-math';
import { GoalSheet } from './goal-sheet.tsx';
import { goalChart } from './goals-model.ts';
import { BudgetSheets } from './sheets/budget-sheets.tsx';
import { openBudgetSheet } from './sheets/store.ts';
import { TabFailed } from './tab-failed.tsx';

const locale = 'en';

// Goals (docs/ui.md §6): one tile per goal with the figure, a bar, the plan
// line and the line from today's balance to the target. Every figure is the
// server's; the bar is a ratio of two of them.
export function GoalsTab() {
  const goals = useQuery(goalsQuery);
  const today = useQuery(todayQuery);
  const [adding, setAdding] = useState(false);
  const list = goals.data?.goals;

  const actions = (
    <>
      <BracketButton
        onPress={() => {
          openBudgetSheet('payday');
        }}
      >
        {t('budgetGoalsIous.goals.payday')}
      </BracketButton>
      <BracketButton
        onPress={() => {
          openBudgetSheet('weekly-review');
        }}
      >
        {t('budgetGoalsIous.goals.weekly')}
      </BracketButton>
      <PrimaryButton
        onPress={() => {
          setAdding(true);
        }}
      >
        {t('budgetGoalsIous.goals.add')}
      </PrimaryButton>
    </>
  );

  let body;
  if (goals.isError) {
    body = (
      <TabFailed
        retry={() => {
          void goals.refetch();
        }}
      />
    );
  } else if (list === undefined) {
    body = <SkeletonTile />;
  } else if (list.length === 0) {
    body = (
      <EmptyState
        title={t('budgetGoalsIous.goals.empty')}
        hint={t('budgetGoalsIous.goals.emptyHint')}
      />
    );
  }

  return (
    <>
      <Grid>
        <Tile
          title={t('budgetGoalsIous.goals.title')}
          {...(list === undefined
            ? {}
            : {
                subtitle: t('budgetGoalsIous.goals.subtitle', {
                  count: list.length,
                }),
              })}
          span="full"
          actions={actions}
          {...(body === undefined ? { bodyClassName: 'hidden' } : {})}
        >
          {body}
        </Tile>
        {list?.map((goal) => (
          <GoalTile key={goal.id} goal={goal} today={today.data?.today} />
        ))}
      </Grid>
      <GoalSheet
        open={adding}
        onClose={() => {
          setAdding(false);
        }}
      />
      <BudgetSheets />
    </>
  );
}

function GoalTile({
  goal,
  today,
}: {
  goal: GoalView;
  today: LocalDate | undefined;
}) {
  const queryClient = useQueryClient();
  const archive = useMutation({
    mutationFn: () => updateGoal(goal.id, { archived: true }),
    onSuccess: () => {
      for (const queryKey of poolQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
    },
  });
  const fraction = barFraction(goal.saved.amountMinor, goal.target.amountMinor);
  const chart = today === undefined ? null : goalChart(goal, today, locale);
  const target = formatMoney(goal.target, 'symbol', locale);
  const date = goal.targetOn === null ? null : formatDay(goal.targetOn, locale);
  return (
    <Tile
      title={goal.name}
      {...(date === null
        ? {}
        : { subtitle: t('budgetGoalsIous.goals.by', { date }) })}
      actions={
        <BracketButton
          aria-label={t('budgetGoalsIous.goals.archiveLabel', {
            name: goal.name,
          })}
          isDisabled={archive.isPending}
          onPress={() => {
            archive.mutate();
          }}
        >
          {t('budgetGoalsIous.goals.archive')}
        </BracketButton>
      }
      bodyClassName="flex flex-col gap-1.5 pt-2"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-stat font-semibold">
          <Amount amount={goal.saved} locale={locale} />
        </span>
        <span className="num text-small text-text-muted">
          {t('budgetGoalsIous.goals.savedOf', { target })}
        </span>
      </div>
      <Bar
        value={fraction}
        label={t('budgetGoalsIous.goals.progress', { name: goal.name })}
      />
      <p className="num text-small text-text-muted">
        {goal.reached
          ? t('budgetGoalsIous.goals.reached')
          : t('budgetGoalsIous.goals.left', {
              amount: formatMoney(goal.remaining, 'symbol', locale),
            })}
        {' · '}
        {date === null
          ? t('budgetGoalsIous.goals.planNoDate', { target })
          : t('budgetGoalsIous.goals.plan', {
              target,
              when: t('budgetGoalsIous.goals.by', { date }),
            })}
      </p>
      {goal.missingRates.length > 0 ? (
        <p className="font-sans text-small text-text-muted">
          {t('budgetGoalsIous.goals.missingRates', {
            currency: goal.target.currency,
          })}
        </p>
      ) : null}
      {chart === null || goal.targetOn === null ? (
        <p className="font-sans text-small text-text-muted">
          {t('budgetGoalsIous.goals.chart.noDate')}
        </p>
      ) : (
        <Chart
          label={t('budgetGoalsIous.goals.chart.summary', {
            name: goal.name,
            saved: formatMoney(goal.saved, 'symbol', locale),
            target,
            date: formatDay(goal.targetOn, locale),
          })}
          series={[
            {
              id: 'goal',
              label: goal.name,
              color: 'series-1',
              points: chart.points,
              area: true,
              endLabel: target,
            },
          ]}
          yTicks={chart.yTicks}
          xTicks={chart.xTicks}
          table={{
            caption: t('budgetGoalsIous.goals.chart.caption', {
              name: goal.name,
            }),
            headers: [
              t('budgetGoalsIous.goals.chart.day'),
              t('budgetGoalsIous.goals.chart.value'),
            ],
            rows: [
              [
                t('budgetGoalsIous.goals.chart.today'),
                formatMoney(goal.saved, 'symbol', locale),
              ],
              [formatDay(goal.targetOn, locale), target],
            ],
          }}
        />
      )}
      {archive.isError ? (
        <p role="alert" className="text-small text-negative">
          {t('budgetGoalsIous.loadFailed')}
        </p>
      ) : null}
    </Tile>
  );
}
