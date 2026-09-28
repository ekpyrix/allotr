import { z } from 'zod';
import { ENTRY_KINDS, type QuickEntryDraft } from './draft.ts';

// The last account and category per kind, on this device only, so the next
// entry needs fewer keystrokes (#58, "under 5 s on a phone").

export const LAST_USED_KEY = 'allotr.quick-entry.last';

const choiceSchema = z.object({
  accountId: z.string().optional(),
  toAccountId: z.string().optional(),
  categoryId: z.string().optional(),
});
const lastUsedSchema = z.partialRecord(z.enum(ENTRY_KINDS), choiceSchema);
export type LastUsed = z.infer<typeof lastUsedSchema>;

export function readLastUsed(
  storage: Pick<Storage, 'getItem'> | undefined,
): LastUsed {
  try {
    const raw = storage?.getItem(LAST_USED_KEY);
    if (raw == null) return {};
    const parsed = lastUsedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function rememberChoice(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  draft: QuickEntryDraft,
): void {
  try {
    const choice = {
      accountId: draft.accountId,
      categoryId: draft.categoryId,
      ...(draft.kind === 'transfer' ? { toAccountId: draft.toAccountId } : {}),
    };
    storage?.setItem(
      LAST_USED_KEY,
      JSON.stringify({ ...readLastUsed(storage), [draft.kind]: choice }),
    );
  } catch {
    // Private browsing or blocked storage: the next entry starts fresh.
  }
}
