import { localDateSchema, type LocalDate } from '@allotr/shared';
import { z } from 'zod';

// Which cycle /cycle shows: the day it opened, or the current one, and
// which tab is open, so each tab has its own link. Anything malformed is
// dropped rather than sent to the server.

export const cycleTabs = [
  'overview',
  'days',
  'categories',
  'bills',
  'plan',
  'calendar',
] as const;
export type CycleTab = (typeof cycleTabs)[number];

export interface CycleSearch {
  start?: LocalDate | undefined;
  tab?: CycleTab | undefined;
}

const tabSchema = z.enum(cycleTabs);

// The keys are always returned: the router merges the raw params
// underneath, so a missing key would let an unchecked value through.
export function validateCycleSearch(
  search: Record<string, unknown>,
): CycleSearch {
  const start = localDateSchema.safeParse(search.start);
  const tab = tabSchema.safeParse(search.tab);
  return {
    start: start.success ? start.data : undefined,
    tab: tab.success && tab.data !== 'overview' ? tab.data : undefined,
  };
}
