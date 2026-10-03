import type { ConfirmPlanBody } from '@allotr/shared';
import { queryOptions } from '@tanstack/react-query';
import { call } from './api.ts';
import { endpoints } from './endpoints.ts';

// The payday sheet and insights (ADR 0021). All are folded from the ledger
// on each read, so they sit under ['today'] and refresh with any entry.

export const paydayPlanQuery = queryOptions({
  queryKey: ['today', 'payday-plan'],
  queryFn: () => call(endpoints.paydayPlan),
});

export const emergencyFundQuery = queryOptions({
  queryKey: ['today', 'insights', 'emergency-fund'],
  queryFn: () => call(endpoints.emergencyFund),
});

export function netWorthQuery(days: number) {
  return queryOptions({
    queryKey: ['today', 'insights', 'net-worth', days],
    queryFn: () => call(endpoints.netWorth, { query: { days } }),
  });
}

export const weeklyReviewQuery = queryOptions({
  queryKey: ['today', 'insights', 'weekly-review'],
  queryFn: () => call(endpoints.weeklyReview),
});

export function confirmPaydayPlan(body: ConfirmPlanBody) {
  return call(endpoints.confirmPaydayPlan, { body });
}
