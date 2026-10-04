import { randomUUID } from 'node:crypto';
import { accountId, balanceOf, budgetSwitch, writeOff } from '@allotr/core';
import type {
  Bundle,
  BundleTransaction,
  CreateTransactionBody,
  ImportResult,
  LocalDate,
  Money,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { finishSetup } from '../setup.ts';
import {
  atPath,
  isDomainError,
  RequestProblem,
} from '../http/domain-errors.ts';
import { insertAccount } from './accounts.ts';
import { insertBill, insertBillPayment } from './bills.ts';
import { insertCategory } from './categories.ts';
import { createIouIn, recordRepaymentIn, writeOffIouIn } from './ious.ts';
import {
  categoryKey,
  nameKey,
  resolveBundle,
  type ExistingCategory,
} from './import-resolve.ts';
import { applyLedgerSettings, recordLedgerStart } from './ledger-settings.ts';
import { upsertRate } from './rates.ts';
import {
  appendTransaction,
  ensureSystemAccounts,
  loadChart,
  loadLedger,
  newEntry,
  type Db,
} from './store.ts';
import { createTag, listTags } from './tags.ts';
import { recordTransaction, storeTransaction } from './transactions.ts';

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
    .select(['id', 'name', 'kind', 'parent_id', 'is_paycheck'])
    .where('user_id', '=', userId)
    .where('merged_into_id', 'is', null)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind as ExistingCategory['kind'],
    parentId: row.parent_id,
    isPaycheck: row.is_paycheck === 1,
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

type SpendOrTransfer = Exclude<
  BundleTransaction,
  { kind: 'write_off' | 'iou' | 'iou_payment' | 'iou_write_off' }
>;

function toBody(
  entry: SpendOrTransfer,
  account: (name: string) => string,
  category: (path: string) => string,
  tagIds: string[],
): CreateTransactionBody {
  const common = {
    occurredOn: entry.occurredOn,
    ...(entry.time === undefined ? {} : { occurredTime: entry.time }),
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
    ...(entry.lines === undefined
      ? { categoryId: category(entry.category ?? '') }
      : {
          lines: entry.lines.map((line) => ({
            categoryId: category(line.category),
            amount: line.amount,
          })),
        }),
    ...(entry.foreignAmount === undefined
      ? {}
      : { foreignAmount: entry.foreignAmount }),
    ...common,
  };
}

// A write-off, as archiving with `settle: write_off` records it.
async function recordWriteOff(
  db: Db,
  userId: string,
  entry: Extract<BundleTransaction, { kind: 'write_off' }>,
  id: string,
  tagIds: readonly string[],
  now: Date,
): Promise<string> {
  const chart = await ensureSystemAccounts(
    db,
    userId,
    await loadChart(db, userId),
    [entry.balance.currency],
    now,
  );
  const account = chart.get(accountId(id));
  if (account !== undefined && account.currency !== entry.balance.currency) {
    throw new RequestProblem(
      400,
      'currency_mismatch',
      `The write-off must be in ${account.currency}.`,
    );
  }
  const transaction = writeOff(
    chart,
    newEntry(now, entry.occurredOn, entry.note, entry.time),
    { accountId: accountId(id), balance: entry.balance },
  );
  await storeTransaction(db, userId, transaction, tagIds, null, 'import');
  return transaction.id;
}

async function recordSwitch(
  db: Db,
  userId: string,
  id: string,
  on: LocalDate,
  budgetGroup: 'on' | 'off',
  now: Date,
): Promise<void> {
  const chart = await loadChart(db, userId);
  const ledger = await loadLedger(db, userId, chart);
  const entry = budgetSwitch(chart, ledger, newEntry(now, on), {
    accountId: accountId(id),
    budgetGroup,
  });
  await appendTransaction(db, userId, entry, { source: 'import' });
}

async function insertReconciliation(
  db: Db,
  userId: string,
  item: Bundle['reconciliations'][number],
  account: Readonly<{ id: string; currency: string }>,
  adjustmentId: string | null,
  now: Date,
): Promise<void> {
  const mismatch = (['stated', 'computed'] as const).find(
    (field) => item[field].currency !== account.currency,
  );
  if (mismatch !== undefined) {
    throw atPath(
      new RequestProblem(
        400,
        'currency_mismatch',
        `The balances must be in ${account.currency}.`,
      ),
      `/${mismatch}`,
    );
  }
  if (adjustmentId !== null && same(item.stated, item.computed)) {
    throw atPath(
      new RequestProblem(
        400,
        'invalid_reconciliation',
        'Only a difference is adjusted.',
      ),
      '/adjustment',
    );
  }
  await db
    .insertInto('reconciliations')
    .values({
      id: randomUUID(),
      user_id: userId,
      account_id: account.id,
      currency: account.currency,
      on_date: item.on,
      stated_minor: item.stated.amountMinor,
      computed_minor: item.computed.amountMinor,
      adjustment_transaction_id: adjustmentId,
      created_at: now.toISOString(),
    })
    .execute();
}

function same(a: Money, b: Money): boolean {
  return a.amountMinor === b.amountMinor && a.currency === b.currency;
}

// Archives the bundle's archived accounts once everything else is in. As
// in the API, only an account at zero is archived.
async function archiveAccounts(
  db: Db,
  userId: string,
  ids: ReadonlyMap<number, string>,
  now: Date,
): Promise<void> {
  if (ids.size === 0) return;
  const chart = await loadChart(db, userId);
  const ledger = await loadLedger(db, userId, chart);
  for (const [index, id] of ids) {
    const balance = balanceOf(chart, ledger, accountId(id));
    if (balance.amountMinor !== 0) {
      throw atPath(
        new RequestProblem(
          409,
          'account_not_empty',
          'An archived account must end at zero. Add the transfer or write-off that emptied it.',
        ),
        `/accounts/${String(index)}/archived`,
      );
    }
    await db
      .updateTable('accounts')
      .set({ archived: 1, updated_at: now.toISOString() })
      .where('user_id', '=', userId)
      .where('id', '=', id)
      .execute();
  }
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

    for (const [id, isPaycheck] of resolved.paycheckFlags) {
      await trx
        .updateTable('categories')
        .set({ is_paycheck: isPaycheck ? 1 : 0, updated_at: now.toISOString() })
        .where('user_id', '=', userId)
        .where('id', '=', id)
        .execute();
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
            isPaycheck: category.isPaycheck ?? false,
            colour: category.colour,
            icon: category.icon,
            ...placement,
          },
          now,
        ),
      );
      categoryIds.set(item.key, id);
    }

    const accountIds = new Map<string, string>();
    const toArchive = new Map<number, string>();
    const firstDay = earliestDay(bundle);
    for (const [index, account] of bundle.accounts.entries()) {
      // Switches are recorded after the entries; insertAccount ignores them.
      const { archived, ...fields } = account;
      const openedOn = fields.openedOn ?? firstDay;
      const input = {
        ...fields,
        ...(openedOn === undefined ? {} : { openedOn }),
      };
      const id = await at(`/accounts/${String(index)}`, () =>
        insertAccount(trx, userId, input, now, 'import'),
      );
      accountIds.set(nameKey(account.name), id);
      if (archived === true) toArchive.set(index, id);
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
    // IOU refs to the IOUs they stand for, as the entries are recorded.
    const iouIds = new Map<string, string>();
    let ious = 0;
    for (const [index, entry] of bundle.transactions.entries()) {
      const tags = [
        ...new Set(
          (entry.tags ?? []).map((name) => lookup(tagIds, nameKey(name))),
        ),
      ];
      const id = await at(`/transactions/${String(index)}`, async () => {
        if (entry.kind === 'iou') {
          const created = await createIouIn(
            trx,
            userId,
            {
              direction: entry.direction,
              accountId: account(entry.account),
              people: entry.people.map((p) => ({
                person: p.person,
                amount: p.amount,
                ...(p.dueOn === undefined ? {} : { dueOn: p.dueOn }),
              })),
              ...(entry.ownShare === undefined
                ? {}
                : {
                    ownShare: {
                      amount: entry.ownShare.amount,
                      categoryId: category(entry.ownShare.category),
                    },
                  }),
              occurredOn: entry.occurredOn,
              ...(entry.note === undefined ? {} : { note: entry.note }),
              ...(tags.length === 0 ? {} : { tagIds: tags }),
            },
            null,
            'import',
            now,
          );
          entry.people.forEach((p, i) => {
            const made = created.ious[i];
            if (p.ref !== undefined && made !== undefined) {
              iouIds.set(p.ref, made);
            }
          });
          ious += entry.people.length;
          return created.id;
        }
        if (entry.kind === 'iou_payment') {
          return (
            await recordRepaymentIn(
              trx,
              userId,
              {
                accountId: account(entry.account),
                direction: 'owed-to-me' as const,
                settles: entry.settles.map((line) => ({
                  iouId: lookup(iouIds, line.iou),
                  amount: line.amount,
                })),
                occurredOn: entry.occurredOn,
                ...(entry.note === undefined ? {} : { note: entry.note }),
                ...(tags.length === 0 ? {} : { tagIds: tags }),
              },
              'import',
              now,
            )
          ).id;
        }
        if (entry.kind === 'iou_write_off') {
          return writeOffIouIn(
            trx,
            userId,
            lookup(iouIds, entry.iou),
            {
              categoryId: category(entry.category),
              occurredOn: entry.occurredOn,
              ...(entry.note === undefined ? {} : { note: entry.note }),
            },
            'import',
            now,
          );
        }
        return entry.kind === 'write_off'
          ? recordWriteOff(
              trx,
              userId,
              entry,
              account(entry.account),
              tags,
              now,
            )
          : recordTransaction(
              trx,
              userId,
              toBody(entry, account, category, tags),
              'import',
              now,
            );
      });
      if (entry.ref !== undefined) refs.set(entry.ref, id);
    }

    for (const [index, item] of bundle.accounts.entries()) {
      for (const [s, change] of (item.switches ?? []).entries()) {
        await at(`/accounts/${String(index)}/switches/${String(s)}`, () =>
          recordSwitch(
            trx,
            userId,
            account(item.name),
            change.on,
            change.budgetGroup,
            now,
          ),
        );
      }
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
            ...(bill.price === undefined ? {} : { price: bill.price }),
            accountId: account(bill.account),
            ...(bill.category === undefined
              ? {}
              : { categoryId: category(bill.category) }),
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
            : {
                transactionId: lookup(refs, payment.transaction),
                recorded: payment.recorded === true,
              };
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

    for (const [index, item] of bundle.reconciliations.entries()) {
      const id = account(item.account);
      const currency =
        bundle.accounts.find((a) => nameKey(a.name) === nameKey(item.account))
          ?.currency ?? '';
      const adjustment =
        item.adjustment === undefined ? null : lookup(refs, item.adjustment);
      await at(`/reconciliations/${String(index)}`, () =>
        insertReconciliation(
          trx,
          userId,
          item,
          { id, currency },
          adjustment,
          now,
        ),
      );
    }

    await archiveAccounts(trx, userId, toArchive, now);

    // The first cycle opens with the imported history, not on the day of
    // the import.
    await recordLedgerStart(trx, userId, now);
    // Setup would only ask for what the bundle already set.
    await finishSetup(trx, userId, now);

    return {
      accounts: bundle.accounts.length,
      categoriesCreated: resolved.toCreate.length,
      categoriesMatched: resolved.matched,
      rates: bundle.rates.length,
      tags: tagsCreated,
      transactions: bundle.transactions.length,
      bills: bundle.bills.length,
      billPayments,
      reconciliations: bundle.reconciliations.length,
      ious,
    };
  });
}
