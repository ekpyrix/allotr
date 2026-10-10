import { idSchema } from '@allotr/shared';

// The Accounts screen keeps the open account in the URL (docs/ui.md §5), so
// back and forward work and an account can be bookmarked. A malformed value
// is dropped.

export interface AccountsSearch {
  account?: string | undefined;
}

export function validateAccountsSearch(
  raw: Record<string, unknown>,
): AccountsSearch {
  const parsed = idSchema.safeParse(raw['account']);
  return parsed.success ? { account: parsed.data } : {};
}
