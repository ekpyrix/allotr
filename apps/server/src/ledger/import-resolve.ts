import type { Bundle } from '@allotr/shared';
import type { PathError } from '../http/domain-errors.ts';

// Checks every name a bundle refers to before anything is written, so most
// mistakes come back together, each with its place in the bundle. Pure: the
// caller passes the categories the user already has. Names compare without
// case, as the database's unique indexes do.

type Kind = 'expense' | 'income' | 'transfer';

export type ExistingCategory = Readonly<{
  id: string;
  name: string;
  kind: Kind;
  parentId: string | null;
}>;

export type CategoryToCreate = Readonly<{
  index: number;
  /** The lower-cased path, "top" or "top/child". */
  key: string;
  parentKey: string | null;
  kind: Kind;
}>;

export type ResolvedBundle = Readonly<{
  errors: PathError[];
  /** Categories the user already has, by lower-cased path. */
  existingIds: ReadonlyMap<string, string>;
  /** Parents before children. */
  toCreate: readonly CategoryToCreate[];
  /** Bundle categories that reuse one the user already has. */
  matched: number;
}>;

const maxErrors = 100;

export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function categoryKey(path: string): string {
  return path.split('/').map(nameKey).join('/');
}

/** A JSON Pointer (RFC 6901) to a place in the bundle. */
export function pointer(path: readonly PropertyKey[]): string {
  return path
    .map(
      (part) => `/${String(part).replaceAll('~', '~0').replaceAll('/', '~1')}`,
    )
    .join('');
}

type Report = (path: readonly PropertyKey[], message: string) => void;

type Categories = {
  existingIds: Map<string, string>;
  kinds: Map<string, Kind>;
  toCreate: CategoryToCreate[];
  matched: number;
};

function resolveCategories(
  bundle: Bundle,
  existing: readonly ExistingCategory[],
  report: Report,
): Categories {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const existingIds = new Map<string, string>();
  const kinds = new Map<string, Kind>();
  const topLevel = new Set<string>();
  for (const c of existing) {
    const parent = c.parentId === null ? undefined : byId.get(c.parentId);
    const key =
      parent === undefined
        ? nameKey(c.name)
        : `${nameKey(parent.name)}/${nameKey(c.name)}`;
    existingIds.set(key, c.id);
    kinds.set(key, c.kind);
    if (c.parentId === null) topLevel.add(key);
  }

  const declared = new Set<string>();
  const parents: CategoryToCreate[] = [];
  const children: CategoryToCreate[] = [];
  let matched = 0;
  // Top-level categories first, so a child may come before its parent.
  const ordered = bundle.categories
    .map((category, index) => ({ category, index }))
    .sort(
      (a, b) =>
        Number(a.category.parent !== undefined) -
        Number(b.category.parent !== undefined),
    );
  for (const { category, index } of ordered) {
    const at = ['categories', index] as const;
    const parentKey =
      category.parent === undefined ? null : nameKey(category.parent);
    const key =
      parentKey === null
        ? nameKey(category.name)
        : `${parentKey}/${nameKey(category.name)}`;
    if (declared.has(key)) {
      report(
        [...at, 'name'],
        `The category "${category.name}" is listed twice.`,
      );
      continue;
    }
    declared.add(key);
    if (parentKey !== null && !topLevel.has(parentKey)) {
      report(
        [...at, 'parent'],
        `There is no top-level category "${category.parent ?? ''}".`,
      );
      continue;
    }
    const known =
      kinds.get(key) ?? (parentKey === null ? undefined : kinds.get(parentKey));
    const kind = known ?? category.kind;
    if (kind === undefined) {
      report(
        [...at, 'kind'],
        'Say whether a top-level category is for expenses, income or transfers.',
      );
      continue;
    }
    if (category.kind !== undefined && category.kind !== kind) {
      report([...at, 'kind'], `"${category.name}" is a ${kind} category.`);
      continue;
    }
    if (existingIds.has(key)) {
      matched += 1;
      continue;
    }
    kinds.set(key, kind);
    if (parentKey === null) {
      topLevel.add(key);
      parents.push({ index, key, parentKey, kind });
    } else {
      children.push({ index, key, parentKey, kind });
    }
  }
  return { existingIds, kinds, toCreate: [...parents, ...children], matched };
}

// The path as the user wrote the names, for hints.
function displayPath(key: string, names: readonly string[]): string {
  return key
    .split('/')
    .map((part) => names.find((n) => nameKey(n) === part) ?? part)
    .join('/');
}

export function resolveBundle(
  bundle: Bundle,
  existing: readonly ExistingCategory[],
): ResolvedBundle {
  const errors: PathError[] = [];
  const report: Report = (path, message) => {
    if (errors.length < maxErrors)
      errors.push({ path: pointer(path), message });
  };

  const categories = resolveCategories(bundle, existing, report);
  const names = [
    ...existing.map((c) => c.name),
    ...bundle.categories.map((c) => c.name),
  ];
  const checkCategory = (
    path: readonly PropertyKey[],
    ref: string,
    want: Kind,
  ) => {
    const parts = ref.split('/');
    const key = categoryKey(ref);
    const kind = parts.length <= 2 ? categories.kinds.get(key) : undefined;
    if (kind === undefined) {
      const full =
        parts.length === 1
          ? [...categories.kinds.keys()].find((k) => k.endsWith(`/${key}`))
          : undefined;
      const hint =
        full === undefined
          ? ''
          : ` Did you mean "${displayPath(full, names)}"?`;
      report(path, `There is no category "${ref}".${hint}`);
    } else if (kind !== want) {
      report(path, `"${ref}" is not a ${want} category.`);
    }
  };

  const accounts = new Set<string>();
  bundle.accounts.forEach((account, index) => {
    const key = nameKey(account.name);
    if (accounts.has(key)) {
      report(
        ['accounts', index, 'name'],
        `The account "${account.name}" is listed twice.`,
      );
    }
    accounts.add(key);
  });
  const checkAccount = (path: readonly PropertyKey[], name: string) => {
    if (!accounts.has(nameKey(name))) {
      report(path, `There is no account "${name}" in the bundle.`);
    }
  };

  const rateDays = new Set<string>();
  bundle.rates.forEach((rate, index) => {
    const key = `${rate.base}/${rate.quote}/${rate.asOf}`;
    if (rateDays.has(key)) {
      report(
        ['rates', index],
        `There is already a ${rate.base}/${rate.quote} rate for ${rate.asOf}.`,
      );
    }
    rateDays.add(key);
  });

  const refs = new Set<string>();
  bundle.transactions.forEach((entry, index) => {
    const at = ['transactions', index] as const;
    if (entry.kind === 'transfer') {
      checkAccount([...at, 'from'], entry.from);
      checkAccount([...at, 'to'], entry.to);
      if (entry.category !== undefined) {
        checkCategory([...at, 'category'], entry.category, 'transfer');
      }
    } else {
      checkAccount([...at, 'account'], entry.account);
      checkCategory([...at, 'category'], entry.category, entry.kind);
    }
    if (entry.ref !== undefined) {
      if (refs.has(entry.ref)) {
        report([...at, 'ref'], `The ref "${entry.ref}" is used twice.`);
      }
      refs.add(entry.ref);
    }
  });

  const linked = new Set<string>();
  bundle.bills.forEach((bill, index) => {
    checkAccount(['bills', index, 'account'], bill.account);
    bill.payments.forEach((payment, p) => {
      const ref = payment.transaction;
      if (ref === undefined) return;
      const path = ['bills', index, 'payments', p, 'transaction'];
      if (!refs.has(ref)) {
        report(path, `No entry has the ref "${ref}".`);
      } else if (linked.has(ref)) {
        report(path, `The entry "${ref}" already pays another due date.`);
      }
      linked.add(ref);
    });
  });

  return {
    errors,
    existingIds: categories.existingIds,
    toCreate: categories.toCreate,
    matched: categories.matched,
  };
}
