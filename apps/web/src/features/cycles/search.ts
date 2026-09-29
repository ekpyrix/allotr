import { localDateSchema, type LocalDate } from '@allotr/shared';

// Which cycle /cycle shows: the day it opened, or the current one. A
// malformed day is dropped rather than sent to the server.

export interface CycleSearch {
  start?: LocalDate | undefined;
}

// The key is always returned: the router merges the raw params underneath,
// so a missing key would let an unchecked value through.
export function validateCycleSearch(
  search: Record<string, unknown>,
): CycleSearch {
  const parsed = localDateSchema.safeParse(search.start);
  return { start: parsed.success ? parsed.data : undefined };
}
