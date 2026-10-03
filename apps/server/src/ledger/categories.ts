import { randomUUID } from 'node:crypto';
import type { CategoryView } from '@allotr/shared';
import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { uniquely } from './sqlite-errors.ts';
import type { Db } from './store.ts';

// Two-level categories (FR-L7). A category in use is never deleted: it is
// merged into another one, so committed entries keep pointing at it
// (docs/domain.md "Data model").

type Kind = CategoryView['kind'];

type Row = {
  id: string;
  name: string;
  kind: string;
  parent_id: string | null;
  is_paycheck: number;
  position: number;
  colour: string | null;
  icon: string | null;
  merged_into_id: string | null;
};

const columns = [
  'id',
  'name',
  'kind',
  'parent_id',
  'is_paycheck',
  'position',
  'colour',
  'icon',
  'merged_into_id',
] as const;

function toView(row: Row): CategoryView {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as Kind,
    parentId: row.parent_id,
    isPaycheck: row.is_paycheck === 1,
    position: row.position,
    colour: row.colour as CategoryView['colour'],
    icon: row.icon as CategoryView['icon'],
    mergedIntoId: row.merged_into_id,
  };
}

function notFound(): RequestProblem {
  return new RequestProblem(
    404,
    'category_not_found',
    'There is no such category.',
  );
}

function nameTaken(): RequestProblem {
  return new RequestProblem(
    409,
    'category_name_taken',
    'Another category at this level already has this name.',
  );
}

function invalidParent(detail: string): RequestProblem {
  return new RequestProblem(400, 'invalid_parent', detail);
}

/** A category of the user that has not been merged away. */
async function findActive(db: Db, userId: string, id: string): Promise<Row> {
  const row = await db
    .selectFrom('categories')
    .select(columns)
    .where('user_id', '=', userId)
    .where('id', '=', id)
    .where('merged_into_id', 'is', null)
    .executeTakeFirst();
  if (row === undefined) throw notFound();
  return row;
}

async function hasChildren(
  db: Db,
  userId: string,
  id: string,
): Promise<boolean> {
  const child = await db
    .selectFrom('categories')
    .select('id')
    .where('user_id', '=', userId)
    .where('parent_id', '=', id)
    .where('merged_into_id', 'is', null)
    .executeTakeFirst();
  return child !== undefined;
}

// A parent must be a top-level category of the same kind.
async function checkParent(
  db: Db,
  userId: string,
  parentId: string,
  kind: Kind | undefined,
): Promise<Row> {
  const parent = await db
    .selectFrom('categories')
    .select(columns)
    .where('user_id', '=', userId)
    .where('id', '=', parentId)
    .where('merged_into_id', 'is', null)
    .executeTakeFirst();
  if (parent === undefined)
    throw invalidParent('The parent category does not exist.');
  if (parent.parent_id !== null) {
    throw invalidParent('Categories have two levels; pick a top-level parent.');
  }
  if (kind !== undefined && parent.kind !== kind) {
    throw invalidParent(
      `The parent is an ${parent.kind} category, not ${kind}.`,
    );
  }
  return parent;
}

function checkPaycheck(isPaycheck: boolean, kind: string): void {
  if (isPaycheck && kind !== 'income') {
    throw new RequestProblem(
      400,
      'invalid_paycheck',
      'Only an income category can be the paycheck category.',
    );
  }
}

const kindOrder: Record<string, number> = {
  expense: 0,
  income: 1,
  transfer: 2,
};

function byPosition(a: Row, b: Row): number {
  return a.position - b.position || a.name.localeCompare(b.name);
}

/** Parents by kind and position, each followed by its subcategories. */
export async function listCategories(
  db: Db,
  userId: string,
  includeMerged: boolean,
): Promise<CategoryView[]> {
  let query = db
    .selectFrom('categories')
    .select(columns)
    .where('user_id', '=', userId);
  if (!includeMerged) query = query.where('merged_into_id', 'is', null);
  const rows = await query.execute();
  const children = new Map<string, Row[]>();
  for (const row of rows) {
    if (row.parent_id === null) continue;
    children.set(row.parent_id, [...(children.get(row.parent_id) ?? []), row]);
  }
  return rows
    .filter((row) => row.parent_id === null)
    .sort(
      (a, b) =>
        (kindOrder[a.kind] ?? 0) - (kindOrder[b.kind] ?? 0) || byPosition(a, b),
    )
    .flatMap((parent) => [
      parent,
      ...(children.get(parent.id) ?? []).sort(byPosition),
    ])
    .map(toView);
}

export async function getCategory(
  db: Db,
  userId: string,
  id: string,
): Promise<CategoryView> {
  const row = await db
    .selectFrom('categories')
    .select(columns)
    .where('user_id', '=', userId)
    .where('id', '=', id)
    .executeTakeFirst();
  if (row === undefined) throw notFound();
  return toView(row);
}

export type CreateCategory = Readonly<{
  name: string;
  kind?: Kind | undefined;
  parentId?: string | undefined;
  isPaycheck: boolean;
  position?: number | undefined;
  colour?: CategoryView['colour'] | undefined;
  icon?: CategoryView['icon'] | undefined;
}>;

/** Inserts a category inside the caller's database transaction. */
export async function insertCategory(
  db: Db,
  userId: string,
  input: CreateCategory,
  now: Date,
): Promise<string> {
  const id = randomUUID();
  let kind = input.kind;
  if (input.parentId !== undefined) {
    kind = (await checkParent(db, userId, input.parentId, kind)).kind as Kind;
  }
  if (kind === undefined) {
    throw new RequestProblem(
      400,
      'kind_required',
      'Say whether a top-level category is for expenses, income or transfers.',
    );
  }
  checkPaycheck(input.isPaycheck, kind);
  const last = await db
    .selectFrom('categories')
    .select(sql<number>`coalesce(max(position), 0)`.as('position'))
    .where('user_id', '=', userId)
    .where((eb) =>
      input.parentId === undefined
        ? eb('parent_id', 'is', null)
        : eb('parent_id', '=', input.parentId),
    )
    .executeTakeFirstOrThrow();
  const at = now.toISOString();
  await uniquely(
    () =>
      db
        .insertInto('categories')
        .values({
          id,
          user_id: userId,
          name: input.name,
          kind,
          parent_id: input.parentId ?? null,
          is_paycheck: input.isPaycheck ? 1 : 0,
          position: input.position ?? last.position + 1,
          colour: input.colour ?? null,
          icon: input.icon ?? null,
          created_at: at,
          updated_at: at,
        })
        .execute(),
    nameTaken,
  );
  return id;
}

export async function createCategory(
  db: Kysely<DB>,
  userId: string,
  input: CreateCategory,
  now: Date,
): Promise<CategoryView> {
  const id = await db
    .transaction()
    .execute((trx) => insertCategory(trx, userId, input, now));
  return getCategory(db, userId, id);
}

export type UpdateCategory = Readonly<{
  name?: string | undefined;
  parentId?: string | null | undefined;
  isPaycheck?: boolean | undefined;
  position?: number | undefined;
  colour?: CategoryView['colour'] | undefined;
  icon?: CategoryView['icon'] | undefined;
}>;

export async function updateCategory(
  db: Kysely<DB>,
  userId: string,
  id: string,
  input: UpdateCategory,
  now: Date,
): Promise<CategoryView> {
  await db.transaction().execute(async (trx) => {
    const row = await findActive(trx, userId, id);
    if (input.parentId != null) {
      if (input.parentId === id) {
        throw invalidParent('A category cannot be its own parent.');
      }
      await checkParent(trx, userId, input.parentId, row.kind as Kind);
      if (await hasChildren(trx, userId, id)) {
        throw invalidParent('Move this category’s subcategories first.');
      }
    }
    if (input.isPaycheck !== undefined)
      checkPaycheck(input.isPaycheck, row.kind);
    await uniquely(
      () =>
        trx
          .updateTable('categories')
          .set({
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.parentId === undefined
              ? {}
              : { parent_id: input.parentId }),
            ...(input.isPaycheck === undefined
              ? {}
              : { is_paycheck: input.isPaycheck ? 1 : 0 }),
            ...(input.position === undefined
              ? {}
              : { position: input.position }),
            ...(input.colour === undefined ? {} : { colour: input.colour }),
            ...(input.icon === undefined ? {} : { icon: input.icon }),
            updated_at: now.toISOString(),
          })
          .where('user_id', '=', userId)
          .where('id', '=', id)
          .execute(),
      nameTaken,
    );
  });
  return getCategory(db, userId, id);
}

// Committed entries, postings or merged categories point at it. A merged
// subcategory counts too: deleting the parent would delete it with it.
async function inUse(db: Db, userId: string, id: string): Promise<boolean> {
  const [transaction, posting, merged, child] = await Promise.all([
    db
      .selectFrom('transactions')
      .select('id')
      .where('user_id', '=', userId)
      .where('category_id', '=', id)
      .executeTakeFirst(),
    db
      .selectFrom('postings')
      .select('id')
      .where('user_id', '=', userId)
      .where('category_id', '=', id)
      .executeTakeFirst(),
    db
      .selectFrom('categories')
      .select('id')
      .where('user_id', '=', userId)
      .where('merged_into_id', '=', id)
      .executeTakeFirst(),
    db
      .selectFrom('categories')
      .select('id')
      .where('user_id', '=', userId)
      .where('parent_id', '=', id)
      .executeTakeFirst(),
  ]);
  return (
    transaction !== undefined ||
    posting !== undefined ||
    merged !== undefined ||
    child !== undefined
  );
}

/**
 * Deletes an unused category, or merges it into `mergeInto`. A category in
 * use must be merged (docs/domain.md "Edge cases").
 */
export async function deleteCategory(
  db: Kysely<DB>,
  userId: string,
  id: string,
  mergeInto: string | undefined,
  now: Date,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const row = await findActive(trx, userId, id);
    if (await hasChildren(trx, userId, id)) {
      throw new RequestProblem(
        409,
        'category_has_children',
        'Move or delete its subcategories first.',
      );
    }
    if (mergeInto === undefined) {
      if (await inUse(trx, userId, id)) {
        throw new RequestProblem(
          409,
          'category_in_use',
          'Entries use this category. Choose a category to merge it into.',
        );
      }
      await trx
        .deleteFrom('categories')
        .where('user_id', '=', userId)
        .where('id', '=', id)
        .execute();
      return;
    }

    const target = await trx
      .selectFrom('categories')
      .select(['id', 'kind'])
      .where('user_id', '=', userId)
      .where('id', '=', mergeInto)
      .where('merged_into_id', 'is', null)
      .executeTakeFirst();
    if (target === undefined || target.id === id || target.kind !== row.kind) {
      throw new RequestProblem(
        400,
        'invalid_merge_target',
        `Merge it into another ${row.kind} category.`,
      );
    }
    const at = now.toISOString();
    // Earlier merges into this category follow it, so every redirect is a
    // single step.
    await trx
      .updateTable('categories')
      .set({ merged_into_id: target.id, updated_at: at })
      .where('user_id', '=', userId)
      .where((eb) => eb.or([eb('id', '=', id), eb('merged_into_id', '=', id)]))
      .execute();
  });
}
