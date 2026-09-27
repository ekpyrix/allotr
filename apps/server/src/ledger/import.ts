import type {
  Bundle,
  BundleTransaction,
  CreateTransactionBody,
  ImportResult,
  LocalDate,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import {
  atPath,
  isDomainError,
  RequestProblem,
} from '../http/domain-errors.ts';
import { insertAccount } from './accounts.ts';
import { insertBill, insertBillPayment } from './bills.ts';
import { insertCategory } from './categories.ts';
import {
  categoryKey,
  nameKey,
  resolveBundle,
  type ExistingCategory,
} from './import-resolve.ts';
import { applyLedgerSettings } from './ledger-settings.ts';
import { upsertRate } from './rates.ts';
import type { Db } from './store.ts';
import { createTag, listTags } from './tags.ts';
import { recordTransaction } from './transactions.ts';

// Fills an empty ledger from a bundle (docs/architecture.md "Import
// bundle"). One database transaction and the same writes the API uses; a
// refusal names the bundle item it came from, and nothing is written.

async function isEmpty(db: Db, userId: string): Promise<boolean> {
  const first = (table: 'transactions' | 'bills' | 'fx_rates') =>
    db
      .selectFrom(table)
      .select('id')
      .where('user_id', '=', userId)
      .executeTakeFirst();
  const found = await Promise.all([
    db
      .selectFrom('accounts')
      .select('id')
      .where('user_id', '=', userId)
      .where('system_role', 'is', null)
      .executeTakeFirst(),
    first('transactions'),
    first('bills'),
    first('fx_rates'),
  ]);
  return found.every((row) => row === undefined);
}

async function existingCategories(
  db: Db,
  userId: string,
): Promise<ExistingCategory[]> {
  const rows = await db
    .selectFrom('categories')
    .select(['id', 'name', 'kind', 'parent_id'])
    .where('user_id', '=', userId)
    .where('merged_into_id', 'is', null)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind as ExistingCategory['kind'],
    parentId: row.parent_id,
  }));
}

// Runs one item's write; a refusal points at that item.
async function at<T>(path: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isDomainError(error)) throw atPath(error, path);
    throw error;
  }
}

// The resolve pass checked every name, so a miss is a bug.
function lookup(map: ReadonlyMap<string, string>, key: string): string {
  const id = map.get(key);
  if (id === undefined) throw new Error(`import: unresolved "${key}"`);
  return id;
}

function earliestDay(bundle: Bundle): LocalDate | undefined {
  return bundle.transactions.map((t) => t.occurredOn).sort()[0];
}

function toBody(
  entry: BundleTransaction,
  account: (name: string) => string,
  category: (path: string) => string,
  tagIds: string[],
): CreateTransactionBody {
  const common = {
    occurredOn: entry.occurredOn,
    ...(entry.note === undefined ? {} : { note: entry.note }),
    ...(tagIds.length === 0 ? {} : { tagIds }),
  };
  if (entry.kind === 'transfer') {
    return {
      kind: 'transfer',
      fromAccountId: account(entry.from),
      toAccountId: account(entry.to),
      sent: entry.sent,
      ...(entry.received === undefined ? {} : { received: entry.received }),
      ...(entry.category === undefined
        ? {}
        : { categoryId: category(entry.category) }),
      ...common,
    };
  }
  return {
    kind: entry.kind,
    accountId: account(entry.account),
    amount: entry.amount,
    categoryId: category(entry.category),
    ...(entry.foreignAmount === undefined
      ? {}
      : { foreignAmount: entry.foreignAmount }),
    ...common,
  };
}

export async function importBundle(
  db: Kysely<DB>,
  userId: string,
  bundle: Bundle,
  now: Date,
): Promise<ImportResult> {
  return db.transaction().execute(async (trx) => {
    if (!(await isEmpty(trx, userId))) {
      throw new RequestProblem(
        409,
        'ledger_not_empty',
        'Import fills a new ledger. This one already has accounts, entries, bills or rates.',
      );
    }
    const resolved = resolveBundle(
      bundle,
      await existingCategories(trx, userId),
    );
    if (resolved.errors.length > 0) {
      throw new RequestProblem(
        400,
        'invalid_reference',
        'Some names in the bundle do not match anything.',
        resolved.errors,
      );
    }

    const { settings } = bundle;
    if (settings !== undefined) {
      await at('/settings', () =>
        applyLedgerSettings(trx, userId, settings, now),
      );
    }

    const categoryIds = new Map(resolved.existingIds);
    for (const item of resolved.toCreate) {
      const category = bundle.categories[item.index];
      if (category === undefined) continue;
      const placement =
        item.parentKey === null
          ? { kind: item.kind }
          : { parentId: lookup(categoryIds, item.parentKey) };
      const id = await at(`/categories/${String(item.index)}`, () =>
        insertCategory(
          trx,
          userId,
          {
            name: category.name,
            isPaycheck: category.isPaycheck,
            ...placement,
          },
          now,
        ),
      );
      categoryIds.set(item.key, id);
    }

    const accountIds = new Map<string, string>();
    const firstDay = earliestDay(bundle);
    for (const [index, account] of bundle.accounts.entries()) {
      const openedOn = account.openedOn ?? firstDay;
      const input = {
        ...account,
        ...(openedOn === undefined ? {} : { openedOn }),
      };
      const id = await at(`/accounts/${String(index)}`, () =>
        insertAccount(trx, userId, input, now, 'import'),
      );
      accountIds.set(nameKey(account.name), id);
    }

    for (const [index, rate] of bundle.rates.entries()) {
      await at(`/rates/${String(index)}`, () =>
        upsertRate(trx, userId, rate, now),
      );
    }

    const tagIds = new Map(
      (await listTags(trx, userId)).map((tag) => [nameKey(tag.name), tag.id]),
    );
    let tagsCreated = 0;
    for (const [index, entry] of bundle.transactions.entries()) {
      for (const [t, name] of (entry.tags ?? []).entries()) {
        if (tagIds.has(nameKey(name))) continue;
        const tag = await at(
          `/transactions/${String(index)}/tags/${String(t)}`,
          () => createTag(trx, userId, name, now),
        );
        tagIds.set(nameKey(name), tag.id);
        tagsCreated += 1;
      }
    }

    const account = (name: string) => lookup(accountIds, nameKey(name));
    const category = (path: string) => lookup(categoryIds, categoryKey(path));
    const refs = new Map<string, string>();
    for (const [index, entry] of bundle.transactions.entries()) {
      const tags = [
        ...new Set(
          (entry.tags ?? []).map((name) => lookup(tagIds, nameKey(name))),
        ),
      ];
      const id = await at(`/transactions/${String(index)}`, () =>
        recordTransaction(
          trx,
          userId,
          toBody(entry, account, category, tags),
          'import',
          now,
        ),
      );
      if (entry.ref !== undefined) refs.set(entry.ref, id);
    }

    let billPayments = 0;
    for (const [index, bill] of bundle.bills.entries()) {
      const id = await at(`/bills/${String(index)}`, () =>
        insertBill(
          trx,
          userId,
          {
            name: bill.name,
            amount: bill.amount,
            accountId: account(bill.account),
            dueDay: bill.dueDay,
            active: bill.active,
          },
          now,
        ),
      );
      for (const [p, payment] of bill.payments.entries()) {
        const link =
          payment.transaction === undefined
            ? {}
            : { transactionId: lookup(refs, payment.transaction) };
        await at(`/bills/${String(index)}/payments/${String(p)}`, () =>
          insertBillPayment(
            trx,
            userId,
            id,
            { dueOn: payment.dueOn, paidOn: payment.paidOn, ...link },
            now,
          ),
        );
        billPayments += 1;
      }
    }

    return {
      accounts: bundle.accounts.length,
      categoriesCreated: resolved.toCreate.length,
      categoriesMatched: resolved.matched,
      rates: bundle.rates.length,
      tags: tagsCreated,
      transactions: bundle.transactions.length,
      bills: bundle.bills.length,
      billPayments,
    };
  });
}
