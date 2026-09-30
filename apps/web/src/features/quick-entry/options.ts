import type { AccountView, CategoryView } from '@allotr/shared';
import type { EntryKind, QuickEntryDraft } from './draft.ts';
import type { LastUsed } from './last-used.ts';

export interface CategoryOption {
  readonly id: string;
  readonly label: string;
}

/**
 * Categories for a kind in position order, each child right after its
 * parent as "Parent / Child". Merged categories only resolve old entries.
 */
export function categoryOptions(
  categories: readonly CategoryView[],
  kind: EntryKind,
): CategoryOption[] {
  const usable = categories.filter(
    (c) => c.kind === kind && c.mergedIntoId === null,
  );
  const under = (parentId: string | null, prefix: string): CategoryOption[] =>
    usable
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
      .flatMap((c) => {
        const label = `${prefix}${c.name}`;
        return [{ id: c.id, label }, ...under(c.id, `${label} / `)];
      });
  return under(null, '');
}

export interface DraftDefaults {
  readonly accounts: readonly AccountView[];
  readonly categories: readonly CategoryView[];
  /** From GET /v1/today: the user's day, decided by the server. */
  readonly today: string;
  readonly lastUsed: LastUsed;
}

function known(id: string | undefined, ids: readonly string[]) {
  return id !== undefined && ids.includes(id) ? id : undefined;
}

function choicesFor(
  kind: EntryKind,
  defaults: DraftDefaults,
): Pick<QuickEntryDraft, 'accountId' | 'toAccountId' | 'categoryId'> {
  const open = defaults.accounts.filter((a) => !a.archived);
  const ids = open.map((a) => a.id);
  const remembered = defaults.lastUsed[kind];
  const firstOnBudget = open.find((a) => a.budgetGroup === 'on') ?? open[0];
  const accountId =
    known(remembered?.accountId, ids) ?? firstOnBudget?.id ?? '';
  const others = ids.filter((id) => id !== accountId);
  const toAccountId =
    kind === 'transfer'
      ? (known(remembered?.toAccountId, others) ?? others[0] ?? '')
      : '';
  const categoryIds = categoryOptions(defaults.categories, kind).map(
    (o) => o.id,
  );
  return {
    accountId,
    toAccountId,
    categoryId:
      known(remembered?.categoryId, categoryIds) ??
      (kind === 'income' ? paycheckCategory(defaults)?.id : undefined) ??
      '',
  };
}

// Merged categories only resolve old entries.
function paycheckCategory(defaults: DraftDefaults) {
  return defaults.categories.find(
    (c) => c.kind === 'income' && c.isPaycheck && c.mergedIntoId === null,
  );
}

export function newDraft(defaults: DraftDefaults): QuickEntryDraft {
  return {
    kind: 'expense',
    amount: '',
    received: '',
    foreign: '',
    foreignCurrency: '',
    lines: [],
    tagIds: [],
    note: '',
    occurredOn: defaults.today,
    ...choicesFor('expense', defaults),
  };
}

/**
 * An income entry in the paycheck category, for recording the first
 * paycheck. Without a paycheck category it is a plain income draft.
 */
export function paycheckDraft(defaults: DraftDefaults): QuickEntryDraft {
  const draft = switchKind(newDraft(defaults), 'income', defaults);
  const paycheck = paycheckCategory(defaults);
  return paycheck === undefined ? draft : { ...draft, categoryId: paycheck.id };
}

/**
 * Keeps what was typed; accounts and category follow the new kind. Income
 * starts in the paycheck category until another one has been used.
 */
export function switchKind(
  draft: QuickEntryDraft,
  kind: EntryKind,
  defaults: DraftDefaults,
): QuickEntryDraft {
  return {
    ...draft,
    kind,
    received: '',
    lines: [],
    ...choicesFor(kind, defaults),
  };
}

/**
 * The draft as the user sees it: until the date is edited it is the latest
 * `today` from the server, since the form can open on a cached day that a
 * background refetch then corrects.
 */
export function withToday(
  draft: QuickEntryDraft,
  today: string,
  dateEdited: boolean,
): QuickEntryDraft {
  return dateEdited || draft.occurredOn === today
    ? draft
    : { ...draft, occurredOn: today };
}
