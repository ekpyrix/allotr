import { randomUUID } from 'node:crypto';
import type { Bundle, LocalDate } from '@allotr/shared';
import {
  atPath,
  isDomainError,
  RequestProblem,
} from '../http/domain-errors.ts';
import { checkAmount } from './budgets.ts';
import { readLedgerSettings } from './ledger-settings.ts';
import { nameKey } from './import-resolve.ts';
import { uniquely } from './sqlite-errors.ts';
import { userToday, type Db } from './store.ts';

// The budget setup of a bundle (ADR 0021): pools, budgets, the cover order
// and per-entry cover. The resolve pass has checked the names, so a miss in
// a lookup is a bug. Each write names the bundle item it came from.

async function at<T>(path: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isDomainError(error)) throw atPath(error, path);
    throw error;
  }
}

function lookup(map: ReadonlyMap<string, string>, key: string): string {
  const id = map.get(key);
  if (id === undefined) throw new Error(`import: unresolved "${key}"`);
  return id;
}

const poolNameTaken = () =>
  new RequestProblem(
    409,
    'pool_name_taken',
    'Another pool already has this name.',
  );

/**
 * Sets the two default pools from the bundle and creates the others, in the
 * bundle's order. Returns the pool IDs by lower-cased name.
 */
export async function importPools(
  db: Db,
  userId: string,
  bundle: Bundle,
  now: Date,
): Promise<Map<string, string>> {
  const stamp = now.toISOString();
  const ids = new Map<string, string>();
  const rows = await db
    .selectFrom('pools')
    .select(['id', 'default_for', 'position'])
    .where('user_id', '=', userId)
    .execute();
  let position = Math.max(0, ...rows.map((row) => row.position));
  const items = bundle.pools.map((pool, index) => ({ pool, index }));
  // The defaults first, so a custom pool may take a name they gave up.
  const ordered = [
    ...items.filter(({ pool }) => pool.defaultFor !== undefined),
    ...items.filter(({ pool }) => pool.defaultFor === undefined),
  ];
  for (const { pool, index } of ordered) {
    await at(`/pools/${String(index)}`, async () => {
      const counts =
        pool.countsTowardDaily ?? (pool.kind === 'spending' ? true : false);
      const existing = rows.find((row) => row.default_for === pool.defaultFor);
      if (pool.defaultFor !== undefined && existing !== undefined) {
        await uniquely(
          () =>
            db
              .updateTable('pools')
              .set({
                name: pool.name,
                counts_toward_daily: counts ? 1 : 0,
                updated_at: stamp,
              })
              .where('user_id', '=', userId)
              .where('id', '=', existing.id)
              .execute(),
          poolNameTaken,
        );
        ids.set(nameKey(pool.name), existing.id);
        return;
      }
      const id = randomUUID();
      position += 1;
      await uniquely(
        () =>
          db
            .insertInto('pools')
            .values({
              id,
              user_id: userId,
              name: pool.name,
              kind: pool.kind,
              counts_toward_daily: counts ? 1 : 0,
              position,
              archived: pool.archived === true ? 1 : 0,
              created_at: stamp,
              updated_at: stamp,
            })
            .execute(),
        poolNameTaken,
      );
      ids.set(nameKey(pool.name), id);
    });
  }
  return ids;
}

/**
 * Records the accounts' moves between pools. Each move is a row a
 * millisecond after the one before, so same-day moves keep their order.
 */
export async function importPoolMoves(
  db: Db,
  userId: string,
  bundle: Bundle,
  accountIds: ReadonlyMap<string, string>,
  poolIds: ReadonlyMap<string, string>,
  now: Date,
): Promise<void> {
  let n = 0;
  for (const account of bundle.accounts) {
    for (const move of account.poolMoves ?? []) {
      n += 1;
      await db
        .insertInto('pool_moves')
        .values({
          id: randomUUID(),
          user_id: userId,
          account_id: lookup(accountIds, nameKey(account.name)),
          pool_id: lookup(poolIds, nameKey(move.pool)),
          effective_on: move.on,
          created_at: new Date(now.getTime() + n).toISOString(),
        })
        .execute();
    }
  }
}

export type ImportedBudgets = Readonly<{
  /** Budgets in use, by lower-cased name. */
  inUse: ReadonlyMap<string, string>;
}>;

/**
 * Creates the bundle's budgets with their amounts. A bundle with a Buffer
 * replaces the one every ledger starts with, so its start and amounts are
 * the bundle's.
 */
export async function importBudgets(
  db: Db,
  userId: string,
  bundle: Bundle,
  lookups: Readonly<{
    category: (path: string) => string;
    tag: (name: string) => Promise<string>;
    firstDay: LocalDate | undefined;
  }>,
  now: Date,
): Promise<ImportedBudgets> {
  const inUse = new Map<string, string>();
  if (bundle.budgets.length === 0) return { inUse };
  const stamp = now.toISOString();
  const [settings, today] = await Promise.all([
    readLedgerSettings(db, userId),
    userToday(db, userId, now),
  ]);
  if (bundle.budgets.some((b) => b.target.kind === 'buffer')) {
    // Its amounts go with it; nothing else points at it yet.
    await db
      .deleteFrom('budgets')
      .where('user_id', '=', userId)
      .where('kind', '=', 'buffer')
      .execute();
  }
  for (const [index, budget] of bundle.budgets.entries()) {
    const path = `/budgets/${String(index)}`;
    const id = randomUUID();
    for (const [a, amount] of budget.amounts.entries()) {
      await at(`${path}/amounts/${String(a)}/amount`, () => {
        checkAmount(
          amount.amount,
          settings.defaultCurrency,
          budget.target.kind === 'buffer',
        );
        return Promise.resolve();
      });
    }
    await at(path, async () => {
      const { target } = budget;
      const buffer = target.kind === 'buffer';
      const mode = budget.mode ?? (buffer ? 'set-aside' : 'daily');
      const leftover =
        budget.leftover ?? (mode === 'set-aside' ? 'carry' : 'free');
      const categoryId =
        target.kind === 'category' ? lookups.category(target.category) : null;
      const tagId =
        target.kind === 'tag' ? await lookups.tag(target.tag) : null;
      await uniquely(
        () =>
          db
            .insertInto('budgets')
            .values({
              id,
              user_id: userId,
              name: budget.name,
              kind: target.kind,
              category_id: categoryId,
              tag_id: tagId,
              mode,
              leftover,
              started_on: budget.startedOn ?? lookups.firstDay ?? today,
              ended_on: budget.endedOn ?? null,
              created_at: stamp,
              updated_at: stamp,
            })
            .execute(),
        () =>
          new RequestProblem(
            409,
            'budget_taken',
            'This name, category or tag already has a budget in use.',
          ),
      );
      await db
        .insertInto('budget_amounts')
        .values(
          budget.amounts.map((amount) => ({
            id: randomUUID(),
            user_id: userId,
            budget_id: id,
            effective_on: amount.from,
            amount_minor: amount.amount.amountMinor,
            currency: amount.amount.currency,
            created_at: stamp,
          })),
        )
        .execute();
    });
    if (budget.endedOn === undefined) inUse.set(nameKey(budget.name), id);
  }
  return { inUse };
}

type Source = 'free' | { budget: string };

function sourceId(inUse: ReadonlyMap<string, string>, source: Source): string {
  return source === 'free' ? 'free' : lookup(inUse, nameKey(source.budget));
}

/** The cover order and the per-entry cover, as the user chose them. */
export async function importCover(
  db: Db,
  userId: string,
  bundle: Bundle,
  inUse: ReadonlyMap<string, string>,
  entryIds: ReadonlyMap<string, string>,
  now: Date,
): Promise<number> {
  const stamp = now.toISOString();
  if (bundle.coverOrder !== undefined) {
    const value = JSON.stringify(
      bundle.coverOrder.map((source) => sourceId(inUse, source)),
    );
    await db
      .insertInto('user_settings')
      .values({ user_id: userId, key: 'cover_order', value, updated_at: stamp })
      .onConflict((oc) =>
        oc
          .columns(['user_id', 'key'])
          .doUpdateSet({ value, updated_at: stamp }),
      )
      .execute();
  }
  if (bundle.coverOverrides.length === 0) return 0;
  const { defaultCurrency } = await readLedgerSettings(db, userId);
  for (const [index, override] of bundle.coverOverrides.entries()) {
    const entry = lookup(entryIds, override.transaction);
    for (const [position, cover] of override.covers.entries()) {
      await at(
        `/coverOverrides/${String(index)}/covers/${String(position)}`,
        async () => {
          checkAmount(cover.amount, defaultCurrency, false);
          await db
            .insertInto('cover_overrides')
            .values({
              id: randomUUID(),
              user_id: userId,
              transaction_id: entry,
              position,
              source: sourceId(inUse, cover.source),
              amount_minor: cover.amount.amountMinor,
              currency: cover.amount.currency,
              created_at: stamp,
            })
            .execute();
        },
      );
    }
  }
  return bundle.coverOverrides.length;
}
