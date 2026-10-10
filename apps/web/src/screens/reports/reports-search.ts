// The Reports period lives in the URL (docs/ui.md §5), so a view can be
// bookmarked. Custom ranges are a known gap (wrap-up.md). Defaults are left
// out of the URL.
export const REPORT_PERIODS = [
  'cycle',
  'last-cycle',
  'month',
  'last-month',
] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export const DEFAULT_REPORT_PERIOD: ReportPeriod = 'cycle';

export interface ReportsSearch {
  period?: ReportPeriod | undefined;
}

export function validateReportsSearch(
  search: Record<string, unknown>,
): ReportsSearch {
  const period = REPORT_PERIODS.find((p) => p === search.period);
  return {
    period:
      period === undefined || period === DEFAULT_REPORT_PERIOD
        ? undefined
        : period,
  };
}
