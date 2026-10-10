import {
  isLocalDate,
  localDate,
  type AccountView,
  type CreateGoalBody,
  type GoalView,
  type LocalDate,
  type PoolView,
} from '@allotr/shared';
import type { ChartTick } from '@/charts/chart';
import type { Point } from '@/charts/math';
import { positive } from '@/features/ious/draft';
import { formatDay } from '@/features/today/format';
import { formatMoneyShort } from '@/lib/format-money';

// Goals as view models. The figures (saved, target, remaining) are the
// server's; nothing here adds or converts money.

export type WhereChoice = Readonly<{ id: string; label: string }>;

/** Savings pools and accounts in savings pools that have no goal yet. */
export function whereChoices(
  goals: readonly GoalView[],
  pools: readonly PoolView[],
  accounts: readonly AccountView[],
  poolLabel: (name: string) => string,
): WhereChoice[] {
  const takenPools = new Set(goals.map((g) => g.poolId));
  const takenAccounts = new Set(goals.map((g) => g.accountId));
  const savings = new Set(
    pools.filter((p) => p.kind === 'savings').map((p) => p.id),
  );
  return [
    ...pools
      .filter((p) => savings.has(p.id) && !p.archived && !takenPools.has(p.id))
      .map((p) => ({ id: `pool:${p.id}`, label: poolLabel(p.name) })),
    ...accounts
      .filter(
        (a) => !a.archived && savings.has(a.poolId) && !takenAccounts.has(a.id),
      )
      .map((a) => ({ id: `account:${a.id}`, label: a.name })),
  ];
}

export type GoalDraft = Readonly<{
  name: string;
  where: string;
  amount: string;
  date: string;
}>;

export type GoalField = 'name' | 'where' | 'amount' | 'date';

export type GoalResult =
  | { ok: true; body: CreateGoalBody }
  | { ok: false; errors: Partial<Record<GoalField, true>> };

/** The goal form's text as a request; the server still validates it. */
export function toGoalBody(
  draft: GoalDraft,
  currency: string,
  locale: string,
): GoalResult {
  const errors: Partial<Record<GoalField, true>> = {};
  const name = draft.name.trim();
  if (name === '') errors.name = true;
  const [kind, id] = draft.where.split(':');
  const placed = (kind === 'pool' || kind === 'account') && id !== undefined;
  if (!placed) errors.where = true;
  const target = positive(draft.amount, currency, locale);
  if (target === null) errors.amount = true;
  const date = draft.date.trim();
  if (date !== '' && !isLocalDate(date)) errors.date = true;
  if (!placed || target === null || Object.keys(errors).length > 0)
    return { ok: false, errors };
  return {
    ok: true,
    body: {
      name,
      ...(kind === 'pool' ? { poolId: id } : { accountId: id }),
      target,
      ...(date === '' ? {} : { targetOn: localDate(date) }),
    },
  };
}

/** Whole days from one calendar day to another. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

export type GoalChart = Readonly<{
  points: readonly Point[];
  yTicks: readonly ChartTick[];
  xTicks: readonly ChartTick[];
}>;

/**
 * The line from what the goal holds today to its target on the target
 * date. Both ends are server figures; the chart only places them.
 */
export function goalChart(
  goal: GoalView,
  today: LocalDate,
  locale: string,
): GoalChart | null {
  if (goal.targetOn === null) return null;
  const end = Math.max(1, daysBetween(today, goal.targetOn));
  return {
    points: [
      { x: 0, y: goal.saved.amountMinor },
      { x: end, y: goal.target.amountMinor },
    ],
    yTicks: [
      {
        value: goal.saved.amountMinor,
        label: formatMoneyShort(goal.saved, locale),
      },
      {
        value: goal.target.amountMinor,
        label: formatMoneyShort(goal.target, locale),
      },
    ],
    xTicks: [
      { value: 0, label: formatDay(today, locale) },
      { value: end, label: formatDay(goal.targetOn, locale) },
    ],
  };
}
