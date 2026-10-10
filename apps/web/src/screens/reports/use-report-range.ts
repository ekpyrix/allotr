import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import type { LocalDate } from '@allotr/shared';
import { cyclesQuery, todayQuery } from '@/lib/ledger';
import { periodRange, type DateRange } from '../transactions/period.ts';
import {
  DEFAULT_REPORT_PERIOD,
  REPORT_PERIODS,
  type ReportPeriod,
} from './reports-search.ts';

export interface ReportRange {
  period: ReportPeriod;
  /** `null` while loading or when the period has no dates (no earlier cycle). */
  range: DateRange | null;
  today: LocalDate | undefined;
  ready: boolean;
}

/** The period picked in the URL, resolved to dates. Dates only, never money. */
export function useReportRange(): ReportRange {
  // Another screen's `period` can include 'all', so narrow to the report ones.
  const { period: raw } = useSearch({ strict: false });
  const period = REPORT_PERIODS.find((p) => p === raw) ?? DEFAULT_REPORT_PERIOD;
  const today = useQuery(todayQuery);
  const cycles = useQuery(cyclesQuery);
  const todayDate = today.data?.today;
  const ready = todayDate !== undefined && cycles.data !== undefined;
  return {
    period,
    today: todayDate,
    ready,
    range: ready ? periodRange(period, todayDate, cycles.data.cycles) : null,
  };
}
