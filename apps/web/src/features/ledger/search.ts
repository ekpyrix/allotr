import { idSchema, localDateSchema } from '@allotr/shared';
import type { LedgerFilter } from '@/lib/ledger';

// The ledger's filters and open entry live in the URL, so back and forward
// work and a filtered list can be bookmarked. Anything malformed is dropped
// rather than sent to the server.

export interface LedgerSearch {
  account?: string | undefined;
  category?: string | undefined;
  tag?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  q?: string | undefined;
  /** The entry shown in the detail dialog. */
  entry?: string | undefined;
}

const id = (value: unknown) => {
  const parsed = idSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};
const day = (value: unknown) => {
  const parsed = localDateSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};
const text = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, 100);
  return trimmed === '' ? undefined : trimmed;
};

// Every key is returned, even when undefined: the router merges the raw
// params underneath, so a missing key would let an unchecked value through.
export function validateLedgerSearch(
  search: Record<string, unknown>,
): LedgerSearch {
  return {
    account: id(search.account),
    category: id(search.category),
    tag: id(search.tag),
    from: day(search.from),
    to: day(search.to),
    q: text(search.q),
    entry: id(search.entry),
  };
}

export function filterOf(search: LedgerSearch): LedgerFilter {
  return {
    accountId: search.account,
    categoryId: search.category,
    tagId: search.tag,
    from: day(search.from),
    to: day(search.to),
    q: search.q,
  };
}

export function isFiltered(search: LedgerSearch): boolean {
  return Object.values(filterOf(search)).some((v) => v !== undefined);
}
