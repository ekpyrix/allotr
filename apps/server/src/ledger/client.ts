import { AsyncLocalStorage } from 'node:async_hooks';

// Which kind of client is behind the request being served. Entries written
// for an API caller record it, so the ledger can later say "added in the
// app" or "added by chat" (migration 0018). It is a claim the caller makes
// about itself, shown to the user for information and never used to decide
// what is allowed.

export type EntryClient = 'web' | 'chat';

export const CLIENT_HEADER = 'x-allotr-client';

const store = new AsyncLocalStorage<EntryClient>();

/** The client a header value names; anything else is a plain API caller. */
export function parseClient(value: string | undefined): EntryClient | null {
  const name = value?.trim().toLowerCase();
  return name === 'web' || name === 'chat' ? name : null;
}

/** Runs `work` with `client` recorded on every entry it appends. */
export function withClient<T>(client: EntryClient | null, work: () => T): T {
  return client === null ? work() : store.run(client, work);
}

export function currentClient(): EntryClient | null {
  return store.getStore() ?? null;
}
