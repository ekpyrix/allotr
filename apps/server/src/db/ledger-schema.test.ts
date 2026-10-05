import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repoMigrations } from '../testing/database.ts';
import { migrate } from './migrate.ts';
import { openSqlite } from './sqlite.ts';

// Integration tests for migrations/0003_ledger.sql,
// 0004_bill_payments.sql, 0005_reconciliations.sql, 0006_bill_prices.sql,
// 0007_pools.sql, 0008_budgets.sql, 0009_budget_cover.sql,
// 0010_category_style.sql, 0011_income_categories.sql, 0012_ious.sql,
// 0013_reminders.sql, 0014_entry_order_time.sql and
// 0015_entry_replacements.sql, 0016_buffer_currency.sql,
// 0017_implied_rates.sql, 0018_entry_client.sql and 0019_goals.sql against
// real SQLite.

const at = '2026-01-01T00:00:00.000Z';

let dir: string;
let sqlite: Database.Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'allotr-ledger-schema-'));
  sqlite = openSqlite(join(dir, 'allotr.db'));
});

afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

function migrateFrom(migrationsDir: string): readonly string[] {
  return migrate({
    sqlite,
    databasePath: join(dir, 'allotr.db'),
    migrationsDir,
    backupDir: join(dir, 'backups'),
    now: () => new Date(at),
  }).applied;
}

// Migrations up to and including `last`, copied from the repository.
function migrationsUpTo(last: string): string {
  const target = join(dir, `migrations-${last}`);
  mkdirSync(target);
  for (const name of [
    '0001_instance_settings.sql',
    '0002_auth.sql',
    '0003_ledger.sql',
    '0004_bill_payments.sql',
    '0005_reconciliations.sql',
    '0006_bill_prices.sql',
    '0007_pools.sql',
    '0008_budgets.sql',
    '0009_budget_cover.sql',
    '0010_category_style.sql',
    '0011_income_categories.sql',
    '0012_ious.sql',
    '0013_reminders.sql',
    '0014_entry_order_time.sql',
    '0015_entry_replacements.sql',
    '0016_buffer_currency.sql',
    '0017_implied_rates.sql',
  ]) {
    copyFileSync(join(repoMigrations, name), join(target, name));
    if (name.startsWith(last)) break;
  }
  return target;
}

function insertUser(id: string): void {
  sqlite
    .prepare(
      `INSERT INTO users (id, name, email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, `User ${id}`, `${id}@example.test`, at, at);
}

function insertAccount(
  id: string,
  userId: string,
  currency: string,
  fields: { kind?: string; systemRole?: string; group?: string | null } = {},
): void {
  sqlite
    .prepare(
      `INSERT INTO accounts
         (id, user_id, name, kind, system_role, budget_group, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      userId,
      `Account ${id}`,
      fields.kind ?? 'asset',
      fields.systemRole ?? null,
      fields.group === undefined ? 'on' : fields.group,
      currency,
      at,
      at,
    );
}

function insertTransaction(id: string, userId: string): void {
  sqlite
    .prepare(
      `INSERT INTO transactions (id, user_id, kind, occurred_on, created_at, source)
       VALUES (?, ?, 'expense', '2026-01-05', ?, 'api')`,
    )
    .run(id, userId, at);
}

function insertPosting(
  id: string,
  transactionId: string,
  accountId: string,
  amountMinor: number,
  currency: string,
  userId = 'u1',
  position = 0,
): void {
  sqlite
    .prepare(
      `INSERT INTO postings
         (id, user_id, transaction_id, account_id, amount_minor, currency, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, userId, transactionId, accountId, amountMinor, currency, position);
}

function count(sql: string, ...params: unknown[]): number {
  return sqlite
    .prepare(sql)
    .pluck()
    .get(...params) as number;
}

function categoryTree(userId: string): string[] {
  return sqlite
    .prepare(
      `SELECT coalesce(p.name || ' / ', '') || c.name
       FROM categories AS c LEFT JOIN categories AS p ON p.id = c.parent_id
       WHERE c.user_id = ?
       ORDER BY coalesce(p.kind, c.kind), coalesce(p.position, c.position),
                p.id IS NOT NULL, c.position`,
    )
    .pluck()
    .all(userId) as string[];
}

const starterTree = [
  'Food',
  'Food / Groceries',
  'Food / Eating out',
  'Transport',
  'Housing',
  'Housing / Rent',
  'Housing / Utilities',
  'Bills and subscriptions',
  'Health',
  'Shopping',
  'Fun',
  'Other',
  'Paycheck',
  'Other income',
  'Interest',
  'Tax refund',
];

describe('migration 0003_ledger', () => {
  it('applies to a database at 0002 and keeps its users and sign-ins', () => {
    migrateFrom(migrationsUpTo('0002'));
    insertUser('u1');
    sqlite
      .prepare(
        `INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
         VALUES ('a1', 'u1', 'credential', 'u1', 'hash', ?, ?)`,
      )
      .run(at, at);

    expect(migrateFrom(repoMigrations)).toContain('0003_ledger');

    expect(
      sqlite
        .prepare('SELECT provider_id FROM auth_accounts WHERE user_id = ?')
        .pluck()
        .all('u1'),
    ).toEqual(['credential']);
    expect(
      sqlite.prepare('SELECT locale, tz, default_currency FROM users').get(),
    ).toEqual({ locale: 'en-US', tz: 'UTC', default_currency: 'USD' });
    expect(categoryTree('u1')).toEqual(starterTree);
    expect(count('SELECT count(*) FROM accounts')).toBe(0);
  });

  describe('on a fresh database', () => {
    beforeEach(() => {
      migrateFrom(repoMigrations);
      insertUser('u1');
      insertUser('u2');
      insertAccount('card', 'u1', 'USD');
      insertAccount('expenses', 'u1', 'USD', {
        kind: 'expense',
        systemRole: 'expenses',
        group: null,
      });
      insertAccount('wallet', 'u2', 'EUR');
    });

    it('gives every new user the starter categories', () => {
      expect(categoryTree('u1')).toEqual(starterTree);
      expect(
        count(
          'SELECT count(*) FROM categories WHERE user_id = ? AND is_paycheck = 1',
          'u2',
        ),
      ).toBe(1);
    });

    it('refuses to update or delete transactions, postings and tags', () => {
      insertTransaction('t1', 'u1');
      insertPosting('p1', 't1', 'card', -1250, 'USD', 'u1', 0);
      insertPosting('p2', 't1', 'expenses', 1250, 'USD', 'u1', 1);
      sqlite
        .prepare(
          `INSERT INTO tags (id, user_id, name, created_at, updated_at) VALUES ('g1', 'u1', 'trip', ?, ?)`,
        )
        .run(at, at);
      sqlite
        .prepare(
          `INSERT INTO transaction_tags (user_id, transaction_id, tag_id) VALUES ('u1', 't1', 'g1')`,
        )
        .run();

      for (const sql of [
        "UPDATE transactions SET note = 'changed'",
        'DELETE FROM transactions',
        'UPDATE postings SET amount_minor = 1',
        'DELETE FROM postings',
        "UPDATE transaction_tags SET tag_id = 'g1'",
        'DELETE FROM transaction_tags',
      ]) {
        expect(() => sqlite.exec(sql), sql).toThrow(/append-only/);
      }
      expect(count('SELECT count(*) FROM postings')).toBe(2);
    });

    it('refuses a posting in a currency other than its account', () => {
      insertTransaction('t1', 'u1');
      expect(() => {
        insertPosting('p1', 't1', 'card', -1250, 'EUR');
      }).toThrow(/FOREIGN KEY/);
    });

    it("refuses a posting to another user's account", () => {
      insertTransaction('t1', 'u1');
      expect(() => {
        insertPosting('p1', 't1', 'wallet', -1250, 'EUR');
      }).toThrow(/FOREIGN KEY/);
    });

    it('refuses a zero posting', () => {
      insertTransaction('t1', 'u1');
      expect(() => {
        insertPosting('p1', 't1', 'card', 0, 'USD');
      }).toThrow(/CHECK/);
    });

    it('keeps account kind, group and currency fixed', () => {
      expect(() =>
        sqlite.exec("UPDATE accounts SET currency = 'EUR' WHERE id = 'card'"),
      ).toThrow(/fixed/);
      expect(() =>
        sqlite.exec(
          "UPDATE accounts SET budget_group = 'off' WHERE id = 'card'",
        ),
      ).toThrow(/fixed/);
      sqlite.exec("UPDATE accounts SET name = 'Main card', archived = 1");
    });

    it('allows one system account per role and currency', () => {
      expect(() => {
        insertAccount('expenses2', 'u1', 'USD', {
          kind: 'expense',
          systemRole: 'expenses',
          group: null,
        });
      }).toThrow(/UNIQUE/);
      insertAccount('expenses-eur', 'u1', 'EUR', {
        kind: 'expense',
        systemRole: 'expenses',
        group: null,
      });
    });

    it('rejects a system account in a budget group', () => {
      expect(() => {
        insertAccount('conv', 'u1', 'USD', {
          kind: 'equity',
          systemRole: 'conversion',
          group: 'on',
        });
      }).toThrow(/CHECK/);
    });

    it('keeps categories to two levels of one kind', () => {
      const id = (name: string) =>
        sqlite
          .prepare('SELECT id FROM categories WHERE user_id = ? AND name = ?')
          .pluck()
          .get('u1', name) as string;
      const insert = sqlite.prepare(
        `INSERT INTO categories (id, user_id, name, kind, parent_id, created_at, updated_at)
         VALUES (?, 'u1', ?, ?, ?, ?, ?)`,
      );

      expect(() =>
        insert.run('c1', 'Organic', 'expense', id('Groceries'), at, at),
      ).toThrow(/two levels/);
      expect(() =>
        insert.run('c2', 'Bonus', 'income', id('Food'), at, at),
      ).toThrow(/kind of its parent/);
      expect(() =>
        sqlite
          .prepare('UPDATE categories SET parent_id = ? WHERE id = ?')
          .run(id('Transport'), id('Food')),
      ).toThrow(/two levels/);
      insert.run('c3', 'Bonus', 'income', id('Paycheck'), at, at);
    });

    it('removes the whole ledger when its user is deleted', () => {
      insertTransaction('t1', 'u1');
      insertPosting('p1', 't1', 'card', -1250, 'USD', 'u1', 0);
      insertPosting('p2', 't1', 'expenses', 1250, 'USD', 'u1', 1);

      sqlite.exec("DELETE FROM users WHERE id = 'u1'");

      for (const table of [
        'accounts',
        'categories',
        'transactions',
        'postings',
      ]) {
        expect(
          count(`SELECT count(*) FROM ${table} WHERE user_id = 'u1'`),
          table,
        ).toBe(0);
      }
      expect(count('SELECT count(*) FROM accounts')).toBe(1);
    });
  });
});

describe('migration 0004_bill_payments', () => {
  function insertBill(id: string, userId: string, accountId: string): void {
    sqlite
      .prepare(
        `INSERT INTO bills
           (id, user_id, name, amount_minor, currency, account_id, due_day, created_at, updated_at)
         VALUES (?, ?, 'Rent', 90000, 'USD', ?, 5, ?, ?)`,
      )
      .run(id, userId, accountId, at, at);
  }

  const insertPayment = (
    id: string,
    userId: string,
    billId: string,
    dueOn = '2026-02-05',
  ) =>
    sqlite
      .prepare(
        `INSERT INTO bill_payments (id, user_id, bill_id, due_on, paid_on, created_at)
         VALUES (?, ?, ?, ?, '2026-02-04', ?)`,
      )
      .run(id, userId, billId, dueOn, at);

  it('applies to a database at 0003 and keeps its bills', () => {
    migrateFrom(migrationsUpTo('0003'));
    insertUser('u1');
    insertAccount('card', 'u1', 'USD');
    insertBill('b1', 'u1', 'card');

    expect(migrateFrom(migrationsUpTo('0004'))).toEqual(['0004_bill_payments']);

    insertPayment('p1', 'u1', 'b1');
    expect(count('SELECT count(*) FROM bill_payments')).toBe(1);
  });

  describe('on a fresh database', () => {
    beforeEach(() => {
      migrateFrom(repoMigrations);
      insertUser('u1');
      insertUser('u2');
      insertAccount('card', 'u1', 'USD');
      insertBill('b1', 'u1', 'card');
    });

    it("settles each due date once, for the bill's own user", () => {
      insertPayment('p1', 'u1', 'b1');
      expect(() => insertPayment('p2', 'u1', 'b1')).toThrow(/UNIQUE/);
      expect(() => insertPayment('p3', 'u2', 'b1', '2026-03-05')).toThrow(
        /FOREIGN KEY/,
      );
      expect(() => insertPayment('p4', 'u1', 'b1', '2026-02-30')).toThrow(
        /CHECK/,
      );
    });

    it('goes with its bill and its user', () => {
      insertPayment('p1', 'u1', 'b1');
      sqlite.exec("DELETE FROM bills WHERE id = 'b1'");
      expect(count('SELECT count(*) FROM bill_payments')).toBe(0);

      insertBill('b2', 'u1', 'card');
      insertPayment('p2', 'u1', 'b2');
      sqlite.exec("DELETE FROM users WHERE id = 'u1'");
      expect(count('SELECT count(*) FROM bill_payments')).toBe(0);
    });
  });
});

describe('migration 0005_reconciliations', () => {
  const insertReconciliation = (
    id: string,
    fields: {
      userId?: string;
      currency?: string;
      stated?: number;
      adjustment?: string | null;
    } = {},
  ) =>
    sqlite
      .prepare(
        `INSERT INTO reconciliations
           (id, user_id, account_id, currency, on_date, stated_minor,
            computed_minor, adjustment_transaction_id, created_at)
         VALUES (?, ?, 'card', ?, '2026-02-04', ?, 5000, ?, ?)`,
      )
      .run(
        id,
        fields.userId ?? 'u1',
        fields.currency ?? 'USD',
        fields.stated ?? 5000,
        fields.adjustment ?? null,
        at,
      );

  it('applies to a database at 0004', () => {
    migrateFrom(migrationsUpTo('0004'));
    insertUser('u1');
    insertAccount('card', 'u1', 'USD');

    expect(migrateFrom(repoMigrations)).toEqual([
      '0005_reconciliations',
      '0006_bill_prices',
      '0007_pools',
      '0008_budgets',
      '0009_budget_cover',
      '0010_category_style',
      '0011_income_categories',
      '0012_ious',
      '0013_reminders',
      '0014_entry_order_time',
      '0015_entry_replacements',
      '0016_buffer_currency',
      '0017_implied_rates',
      '0018_entry_client',
      '0019_goals',
    ]);

    insertReconciliation('r1');
    expect(count('SELECT count(*) FROM reconciliations')).toBe(1);
  });

  describe('on a fresh database', () => {
    beforeEach(() => {
      migrateFrom(repoMigrations);
      insertUser('u1');
      insertUser('u2');
      insertAccount('card', 'u1', 'USD');
      insertTransaction('t1', 'u1');
    });

    it("keeps a reconciliation in its account's user and currency", () => {
      insertReconciliation('r1');
      expect(() => insertReconciliation('r2', { userId: 'u2' })).toThrow(
        /FOREIGN KEY/,
      );
      expect(() => insertReconciliation('r3', { currency: 'EUR' })).toThrow(
        /FOREIGN KEY/,
      );
    });

    it('has an adjustment only when the balances differ', () => {
      insertReconciliation('r1', { stated: 4000, adjustment: 't1' });
      insertReconciliation('r2', { stated: 4000 });
      expect(() => insertReconciliation('r3', { adjustment: 't1' })).toThrow(
        /CHECK/,
      );
    });

    it('goes with its user', () => {
      insertReconciliation('r1', { stated: 4000, adjustment: 't1' });
      sqlite.exec("DELETE FROM users WHERE id = 'u1'");
      expect(count('SELECT count(*) FROM reconciliations')).toBe(0);
    });
  });
});

describe('migration 0006_bill_prices', () => {
  const insertBill = (
    id: string,
    price: { minor: number | null; currency: string | null } = {
      minor: null,
      currency: null,
    },
  ) =>
    sqlite
      .prepare(
        `INSERT INTO bills
           (id, user_id, name, amount_minor, currency, price_minor,
            price_currency, account_id, due_day, created_at, updated_at)
         VALUES (?, 'u1', 'Streaming', 45000, 'THB', ?, ?, 'card', 5, ?, ?)`,
      )
      .run(id, price.minor, price.currency, at, at);
  const insertPayment = (id: string, dueOn: string, recorded: number) =>
    sqlite
      .prepare(
        `INSERT INTO bill_payments
           (id, user_id, bill_id, due_on, paid_on, transaction_id, recorded, created_at)
         VALUES (?, 'u1', 'b1', ?, ?, NULL, ?, ?)`,
      )
      .run(id, dueOn, dueOn, recorded, at);

  it('applies to a database at 0005 with bills and payments', () => {
    migrateFrom(migrationsUpTo('0005'));
    insertUser('u1');
    insertAccount('card', 'u1', 'THB');
    sqlite
      .prepare(
        `INSERT INTO bills
           (id, user_id, name, amount_minor, currency, account_id, due_day, created_at, updated_at)
         VALUES ('b1', 'u1', 'Streaming', 45000, 'THB', 'card', 5, ?, ?)`,
      )
      .run(at, at);
    sqlite
      .prepare(
        `INSERT INTO bill_payments (id, user_id, bill_id, due_on, paid_on, created_at)
         VALUES ('p1', 'u1', 'b1', '2026-01-05', '2026-01-05', ?)`,
      )
      .run(at);

    expect(migrateFrom(repoMigrations)).toEqual([
      '0006_bill_prices',
      '0007_pools',
      '0008_budgets',
      '0009_budget_cover',
      '0010_category_style',
      '0011_income_categories',
      '0012_ious',
      '0013_reminders',
      '0014_entry_order_time',
      '0015_entry_replacements',
      '0016_buffer_currency',
      '0017_implied_rates',
      '0018_entry_client',
      '0019_goals',
    ]);

    expect(
      sqlite
        .prepare('SELECT price_minor, price_currency, category_id FROM bills')
        .get(),
    ).toEqual({ price_minor: null, price_currency: null, category_id: null });
    expect(sqlite.prepare('SELECT recorded FROM bill_payments').get()).toEqual({
      recorded: 0,
    });
  });

  describe('on a fresh database', () => {
    beforeEach(() => {
      migrateFrom(repoMigrations);
      insertUser('u1');
      insertAccount('card', 'u1', 'THB');
    });

    it('stores a price in another currency', () => {
      insertBill('b1', { minor: 1250, currency: 'USD' });
      expect(count('SELECT count(*) FROM bills')).toBe(1);
    });

    it('refuses a half-given price, or one in the account currency', () => {
      expect(() => {
        insertBill('b1', { minor: 1250, currency: null });
      }).toThrow(/CHECK/);
      expect(() => {
        insertBill('b2', { minor: null, currency: 'USD' });
      }).toThrow(/CHECK/);
      expect(() => {
        insertBill('b3', { minor: 1250, currency: 'THB' });
      }).toThrow(/CHECK/);
      expect(() => {
        insertBill('b4', { minor: 0, currency: 'USD' });
      }).toThrow(/CHECK/);
    });

    it('only marks a payment recorded when it links an entry', () => {
      insertBill('b1');
      expect(() => {
        insertPayment('p1', '2026-01-05', 1);
      }).toThrow(/CHECK/);
      insertPayment('p2', '2026-02-05', 0);
      expect(count('SELECT count(*) FROM bill_payments')).toBe(1);
    });

    it('forgets a deleted category', () => {
      sqlite
        .prepare(
          `INSERT INTO categories (id, user_id, name, kind, created_at, updated_at)
           VALUES ('subs', 'u1', 'Subscriptions', 'expense', ?, ?)`,
        )
        .run(at, at);
      insertBill('b1');
      sqlite.prepare("UPDATE bills SET category_id = 'subs'").run();
      sqlite.prepare("DELETE FROM categories WHERE id = 'subs'").run();
      expect(sqlite.prepare('SELECT category_id FROM bills').get()).toEqual({
        category_id: null,
      });
    });
  });
});

describe('migration 0007_pools', () => {
  const pools = () =>
    sqlite
      .prepare(
        `SELECT user_id, name, kind, counts_toward_daily AS counts, default_for
         FROM pools ORDER BY user_id, position`,
      )
      .all();

  it('gives users from before it the two default pools', () => {
    migrateFrom(migrationsUpTo('0006'));
    insertUser('u1');
    insertUser('u2');
    insertAccount('card', 'u1', 'USD');

    expect(migrateFrom(repoMigrations)).toEqual([
      '0007_pools',
      '0008_budgets',
      '0009_budget_cover',
      '0010_category_style',
      '0011_income_categories',
      '0012_ious',
      '0013_reminders',
      '0014_entry_order_time',
      '0015_entry_replacements',
      '0016_buffer_currency',
      '0017_implied_rates',
      '0018_entry_client',
      '0019_goals',
    ]);

    expect(pools()).toEqual([
      {
        user_id: 'u1',
        name: 'Budget',
        kind: 'spending',
        counts: 1,
        default_for: 'on',
      },
      {
        user_id: 'u1',
        name: 'Savings',
        kind: 'savings',
        counts: 0,
        default_for: 'off',
      },
      {
        user_id: 'u2',
        name: 'Budget',
        kind: 'spending',
        counts: 1,
        default_for: 'on',
      },
      {
        user_id: 'u2',
        name: 'Savings',
        kind: 'savings',
        counts: 0,
        default_for: 'off',
      },
    ]);
    // Accounts stay with their budget group: no move rows are made.
    expect(count('SELECT count(*) FROM pool_moves')).toBe(0);
  });

  describe('on a fresh database', () => {
    beforeEach(() => {
      migrateFrom(repoMigrations);
      insertUser('u1');
      insertAccount('card', 'u1', 'USD');
    });

    it('seeds the default pools for a new user', () => {
      expect(pools()).toHaveLength(2);
    });

    it('keeps a pool kind and its default role fixed', () => {
      expect(() => {
        sqlite.prepare("UPDATE pools SET kind = 'savings'").run();
      }).toThrow(/fixed/);
      expect(() => {
        sqlite.prepare('UPDATE pools SET default_for = NULL').run();
      }).toThrow(/fixed/);
    });

    it('refuses a second default pool or an archived default', () => {
      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO pools (id, user_id, name, kind, counts_toward_daily,
               default_for, created_at, updated_at)
             VALUES ('x', 'u1', 'Other', 'spending', 1, 'on', ?, ?)`,
          )
          .run(at, at);
      }).toThrow(/UNIQUE/);
      expect(() => {
        sqlite
          .prepare("UPDATE pools SET archived = 1 WHERE default_for = 'on'")
          .run();
      }).toThrow(/CHECK/);
    });

    it("keeps moves in the owner's accounts and pools, append-only", () => {
      insertUser('u2');
      const pool = sqlite
        .prepare("SELECT id FROM pools WHERE user_id = 'u2' LIMIT 1")
        .get() as { id: string };
      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO pool_moves (id, user_id, account_id, pool_id, effective_on, created_at)
             VALUES ('m1', 'u1', 'card', ?, '2026-01-02', ?)`,
          )
          .run(pool.id, at);
      }).toThrow(/FOREIGN KEY/);
      const own = sqlite
        .prepare("SELECT id FROM pools WHERE user_id = 'u1' LIMIT 1")
        .get() as { id: string };
      sqlite
        .prepare(
          `INSERT INTO pool_moves (id, user_id, account_id, pool_id, effective_on, created_at)
           VALUES ('m1', 'u1', 'card', ?, '2026-01-02', ?)`,
        )
        .run(own.id, at);
      expect(() => {
        sqlite
          .prepare("UPDATE pool_moves SET effective_on = '2026-02-01'")
          .run();
      }).toThrow(/append-only/);
      expect(() => {
        sqlite.prepare('DELETE FROM pool_moves').run();
      }).toThrow(/append-only/);
      // Deleting the user still clears their rows.
      sqlite.exec("DELETE FROM users WHERE id = 'u1'");
      expect(count('SELECT count(*) FROM pool_moves')).toBe(0);
    });
  });
});

describe('migration 0008_budgets', () => {
  const insertBudget = (
    id: string,
    fields: {
      name?: string;
      kind?: string;
      category?: string | null;
      tag?: string | null;
      mode?: string;
      leftover?: string;
      endedOn?: string | null;
    } = {},
  ) =>
    sqlite
      .prepare(
        `INSERT INTO budgets
           (id, user_id, name, kind, category_id, tag_id, mode, leftover,
            started_on, ended_on, created_at, updated_at)
         VALUES (?, 'u1', ?, ?, ?, ?, ?, ?, '2026-03-01', ?, ?, ?)`,
      )
      .run(
        id,
        fields.name ?? id,
        fields.kind ?? 'category',
        fields.category === undefined ? 'food' : fields.category,
        fields.tag ?? null,
        fields.mode ?? 'daily',
        fields.leftover ?? 'free',
        fields.endedOn ?? null,
        at,
        at,
      );

  it('gives users from before it an empty Buffer', () => {
    migrateFrom(migrationsUpTo('0007'));
    insertUser('u1');

    expect(migrateFrom(repoMigrations)).toEqual([
      '0008_budgets',
      '0009_budget_cover',
      '0010_category_style',
      '0011_income_categories',
      '0012_ious',
      '0013_reminders',
      '0014_entry_order_time',
      '0015_entry_replacements',
      '0016_buffer_currency',
      '0017_implied_rates',
      '0018_entry_client',
      '0019_goals',
    ]);

    expect(
      sqlite
        .prepare(
          `SELECT b.name, b.kind, b.mode, b.leftover, a.amount_minor, a.currency
           FROM budgets AS b JOIN budget_amounts AS a ON a.budget_id = b.id`,
        )
        .all(),
    ).toEqual([
      {
        name: 'Buffer',
        kind: 'buffer',
        mode: 'set-aside',
        leftover: 'carry',
        amount_minor: 0,
        currency: 'USD',
      },
    ]);
  });

  describe('on a fresh database', () => {
    beforeEach(() => {
      migrateFrom(repoMigrations);
      insertUser('u1');
      sqlite
        .prepare(
          `INSERT INTO categories (id, user_id, name, kind, created_at, updated_at)
           VALUES ('food', 'u1', 'Dining', 'expense', ?, ?),
                  ('fun', 'u1', 'Fun stuff', 'expense', ?, ?)`,
        )
        .run(at, at, at, at);
    });

    it('seeds one Buffer for a new user', () => {
      expect(count("SELECT count(*) FROM budgets WHERE kind = 'buffer'")).toBe(
        1,
      );
      expect(() => {
        insertBudget('b2', {
          name: 'Second buffer',
          kind: 'buffer',
          category: null,
          mode: 'set-aside',
          leftover: 'carry',
        });
      }).toThrow(/UNIQUE/);
    });

    it('needs exactly the target its kind names', () => {
      expect(() => {
        insertBudget('b1', { category: null });
      }).toThrow(/CHECK/);
      expect(() => {
        insertBudget('b2', { kind: 'tag', category: null, tag: null });
      }).toThrow(/CHECK/);
      expect(() => {
        insertBudget('b3', { kind: 'category', category: 'food', tag: 'x' });
      }).toThrow(/CHECK/);
    });

    it('allows one budget in use per category, but a new one after it ends', () => {
      insertBudget('b1', { name: 'Dining' });
      expect(() => {
        insertBudget('b2', { name: 'Dining again' });
      }).toThrow(/UNIQUE/);
      sqlite
        .prepare("UPDATE budgets SET ended_on = '2026-03-31' WHERE id = 'b1'")
        .run();
      insertBudget('b2', { name: 'Dining again' });
      expect(
        count("SELECT count(*) FROM budgets WHERE category_id = 'food'"),
      ).toBe(2);
    });

    it('keeps the target and start fixed after creation', () => {
      insertBudget('b1');
      expect(() => {
        sqlite
          .prepare("UPDATE budgets SET category_id = 'fun' WHERE id = 'b1'")
          .run();
      }).toThrow(/fixed/);
      expect(() => {
        sqlite
          .prepare(
            "UPDATE budgets SET started_on = '2026-01-01' WHERE id = 'b1'",
          )
          .run();
      }).toThrow(/fixed/);
    });

    it('keeps the Buffer set aside and carried over', () => {
      expect(() => {
        sqlite
          .prepare("UPDATE budgets SET mode = 'daily' WHERE kind = 'buffer'")
          .run();
      }).toThrow(/CHECK/);
    });

    it('refuses a negative amount and a second amount on a day', () => {
      insertBudget('b1');
      const insertAmount = (id: string, minor: number, on: string) =>
        sqlite
          .prepare(
            `INSERT INTO budget_amounts
               (id, user_id, budget_id, effective_on, amount_minor, currency, created_at)
             VALUES (?, 'u1', 'b1', ?, ?, 'USD', ?)`,
          )
          .run(id, on, minor, at);
      expect(() => {
        insertAmount('a1', -1, '2026-03-01');
      }).toThrow(/CHECK/);
      insertAmount('a1', 90000, '2026-03-01');
      expect(() => {
        insertAmount('a2', 80000, '2026-03-01');
      }).toThrow(/UNIQUE/);
    });

    it('goes with its user', () => {
      insertBudget('b1');
      sqlite.exec("DELETE FROM users WHERE id = 'u1'");
      expect(count('SELECT count(*) FROM budgets')).toBe(0);
      expect(count('SELECT count(*) FROM budget_amounts')).toBe(0);
    });
  });
});

describe('migration 0009_budget_cover', () => {
  const insertEntry = () =>
    sqlite
      .prepare(
        `INSERT INTO transactions (id, user_id, kind, occurred_on, created_at, source)
         VALUES ('t1', 'u1', 'expense', '2026-03-10', ?, 'api')`,
      )
      .run(at);
  const insertOverride = (
    id: string,
    fields: { position?: number; source?: string; minor?: number } = {},
  ) =>
    sqlite
      .prepare(
        `INSERT INTO cover_overrides
           (id, user_id, transaction_id, position, source, amount_minor, currency, created_at)
         VALUES (?, 'u1', 't1', ?, ?, ?, 'USD', ?)`,
      )
      .run(
        id,
        fields.position ?? 0,
        fields.source ?? 'free',
        fields.minor ?? 4000,
        at,
      );

  it('applies to a database at 0008', () => {
    migrateFrom(migrationsUpTo('0008'));
    insertUser('u1');
    expect(migrateFrom(repoMigrations)).toEqual([
      '0009_budget_cover',
      '0010_category_style',
      '0011_income_categories',
      '0012_ious',
      '0013_reminders',
      '0014_entry_order_time',
      '0015_entry_replacements',
      '0016_buffer_currency',
      '0017_implied_rates',
      '0018_entry_client',
      '0019_goals',
    ]);
    expect(count('SELECT count(*) FROM cover_overrides')).toBe(0);
  });

  describe('on a fresh database', () => {
    beforeEach(() => {
      migrateFrom(repoMigrations);
      insertUser('u1');
      insertEntry();
    });

    it('stores a split per entry, one row per source', () => {
      insertOverride('o1');
      insertOverride('o2', { position: 1, source: 'budget-1', minor: 500 });
      expect(count('SELECT count(*) FROM cover_overrides')).toBe(2);
      expect(() => {
        insertOverride('o3', { position: 2, source: 'free' });
      }).toThrow(/UNIQUE/);
      expect(() => {
        insertOverride('o4', { position: 0, source: 'other' });
      }).toThrow(/UNIQUE/);
    });

    it('refuses an empty source and an amount of zero or less', () => {
      expect(() => {
        insertOverride('o1', { source: '' });
      }).toThrow(/CHECK/);
      expect(() => {
        insertOverride('o2', { minor: 0 });
      }).toThrow(/CHECK/);
    });

    it('keeps the entry itself untouched and goes with the user', () => {
      insertOverride('o1');
      // The override is a setting: it can change without touching the entry.
      sqlite.prepare('UPDATE cover_overrides SET amount_minor = 100').run();
      sqlite.exec("DELETE FROM users WHERE id = 'u1'");
      expect(count('SELECT count(*) FROM cover_overrides')).toBe(0);
    });
  });
});

describe('migration 0010_category_style', () => {
  const style = (name: string, userId = 'u1') =>
    sqlite
      .prepare(
        'SELECT colour, icon FROM categories WHERE user_id = ? AND name = ?',
      )
      .get(userId, name);

  it('styles starter categories a user still has unstyled, and no others', () => {
    migrateFrom(migrationsUpTo('0009'));
    insertUser('u1');
    sqlite
      .prepare(
        `INSERT INTO categories (id, user_id, name, kind, created_at, updated_at)
         VALUES ('pets', 'u1', 'Pets', 'expense', ?, ?)`,
      )
      .run(at, at);

    expect(migrateFrom(repoMigrations)).toEqual([
      '0010_category_style',
      '0011_income_categories',
      '0012_ious',
      '0013_reminders',
      '0014_entry_order_time',
      '0015_entry_replacements',
      '0016_buffer_currency',
      '0017_implied_rates',
      '0018_entry_client',
      '0019_goals',
    ]);

    expect(style('Food')).toEqual({ colour: 'series-6', icon: 'utensils' });
    expect(style('Groceries')).toEqual({
      colour: null,
      icon: 'shopping-basket',
    });
    expect(style('Pets')).toEqual({ colour: null, icon: null });
  });

  it('copies the style to a new user with the starter set', () => {
    migrateFrom(repoMigrations);
    insertUser('u2');
    expect(style('Paycheck', 'u2')).toEqual({
      colour: 'series-6',
      icon: 'banknote',
    });
    expect(style('Eating out', 'u2')).toEqual({ colour: null, icon: 'coffee' });
  });

  it('refuses a colour outside the series roles and a malformed icon', () => {
    migrateFrom(repoMigrations);
    insertUser('u1');
    const set = (column: string, value: string) =>
      sqlite
        .prepare(`UPDATE categories SET ${column} = ? WHERE name = 'Food'`)
        .run(value);
    expect(() => set('colour', '#ff0000')).toThrow(/CHECK/);
    expect(() => set('icon', 'Not An Icon')).toThrow(/CHECK/);
    expect(() => set('colour', 'series-3')).not.toThrow();
  });
});

describe('migration 0012_ious', () => {
  function insertIou(
    id: string,
    fields: { due?: string | null; minor?: number; person?: string } = {},
  ) {
    return sqlite
      .prepare(
        `INSERT INTO ious
           (id, user_id, direction, person, amount_minor, currency,
            origin_transaction_id, due_on, created_at, updated_at)
         VALUES (?, 'u1', 'owed-to-me', ?, ?, 'USD', 't1', ?, ?, ?)`,
      )
      .run(
        id,
        fields.person ?? 'Sam Example',
        fields.minor ?? 3000,
        fields.due === undefined ? null : fields.due,
        at,
        at,
      );
  }
  const insertSettlement = (id: string, kind = 'repayment') =>
    sqlite
      .prepare(
        `INSERT INTO iou_settlements
           (id, user_id, iou_id, transaction_id, kind, amount_minor, currency, created_at)
         VALUES (?, 'u1', 'i1', 't2', ?, 1000, 'USD', ?)`,
      )
      .run(id, kind, at);

  it('keeps the data of a database at 0011 when accounts is rebuilt', () => {
    migrateFrom(migrationsUpTo('0011'));
    insertUser('u1');
    insertAccount('card', 'u1', 'USD');
    insertAccount('expenses', 'u1', 'USD', {
      kind: 'expense',
      systemRole: 'expenses',
      group: null,
    });
    insertTransaction('t1', 'u1');
    insertPosting('p1', 't1', 'card', -500, 'USD', 'u1', 0);
    insertPosting('p2', 't1', 'expenses', 500, 'USD', 'u1', 1);
    sqlite
      .prepare(
        `INSERT INTO bills (id, user_id, name, amount_minor, currency, account_id, due_day, created_at, updated_at)
         VALUES ('b1', 'u1', 'Rent', 100000, 'USD', 'card', 1, ?, ?)`,
      )
      .run(at, at);

    expect(migrateFrom(repoMigrations)).toEqual([
      '0012_ious',
      '0013_reminders',
      '0014_entry_order_time',
      '0015_entry_replacements',
      '0016_buffer_currency',
      '0017_implied_rates',
      '0018_entry_client',
      '0019_goals',
    ]);

    expect(count('SELECT count(*) FROM accounts')).toBe(2);
    expect(count('SELECT count(*) FROM postings')).toBe(2);
    expect(count('SELECT count(*) FROM bills')).toBe(1);
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    // The rebuilt table still keeps postings in their account's currency.
    expect(() => {
      insertPosting('p3', 't1', 'card', 1, 'EUR', 'u1', 2);
    }).toThrow(/FOREIGN KEY/);
    // And still refuses to change an account's currency.
    expect(() =>
      sqlite.prepare("UPDATE accounts SET currency = 'EUR'").run(),
    ).toThrow(/fixed/);
  });

  describe('on a fresh database', () => {
    beforeEach(() => {
      migrateFrom(repoMigrations);
      insertUser('u1');
      insertUser('u2');
      insertAccount('card', 'u1', 'USD');
      insertAccount('receivables', 'u1', 'USD', {
        kind: 'receivable',
        systemRole: 'receivables',
        group: null,
      });
      insertTransaction('t1', 'u1');
      insertTransaction('t2', 'u1');
    });

    it('allows one Receivables and one Payables account per currency', () => {
      expect(() => {
        insertAccount('receivables2', 'u1', 'USD', {
          kind: 'receivable',
          systemRole: 'receivables',
          group: null,
        });
      }).toThrow(/UNIQUE/);
      insertAccount('payables', 'u1', 'USD', {
        kind: 'payable',
        systemRole: 'payables',
        group: null,
      });
      expect(() => {
        insertAccount('bad', 'u1', 'EUR', {
          kind: 'equity',
          systemRole: 'payables',
          group: null,
        });
      }).toThrow(/CHECK/);
    });

    it('stores an IOU and what settled it, and refuses nonsense', () => {
      insertIou('i1', { due: '2026-02-01' });
      insertSettlement('s1');
      insertSettlement('s2', 'write-off');
      expect(count('SELECT count(*) FROM iou_settlements')).toBe(2);
      expect(() => insertIou('i2', { minor: 0 })).toThrow(/CHECK/);
      expect(() => insertIou('i3', { person: '  ' })).toThrow(/CHECK/);
      expect(() => insertIou('i4', { due: '2026-02-30' })).toThrow(/CHECK/);
      expect(() => insertSettlement('s3', 'gift')).toThrow(/CHECK/);
    });

    it('only lets the name and due date change, and never deletes', () => {
      insertIou('i1');
      sqlite
        .prepare(
          "UPDATE ious SET person = 'Alex Example', due_on = '2026-05-01'",
        )
        .run();
      expect(() =>
        sqlite.prepare('UPDATE ious SET amount_minor = 1').run(),
      ).toThrow(/keeps its direction/);
      expect(() => sqlite.prepare('DELETE FROM ious').run()).toThrow(
        /never deleted/,
      );
      insertSettlement('s1');
      expect(() =>
        sqlite.prepare('UPDATE iou_settlements SET amount_minor = 1').run(),
      ).toThrow(/append-only/);
      expect(() => sqlite.prepare('DELETE FROM iou_settlements').run()).toThrow(
        /append-only/,
      );
    });

    it("keeps an IOU in its owner's entries and goes with the user", () => {
      expect(() =>
        sqlite
          .prepare(
            `INSERT INTO ious
               (id, user_id, direction, person, amount_minor, currency,
                origin_transaction_id, created_at, updated_at)
             VALUES ('x', 'u2', 'owed-by-me', 'Sam Example', 100, 'USD', 't1', ?, ?)`,
          )
          .run(at, at),
      ).toThrow(/FOREIGN KEY/);
      insertIou('i1');
      insertSettlement('s1');
      sqlite.exec("DELETE FROM users WHERE id = 'u1'");
      expect(count('SELECT count(*) FROM ious')).toBe(0);
      expect(count('SELECT count(*) FROM iou_settlements')).toBe(0);
    });
  });
});

describe('migration 0011_income_categories', () => {
  const incomeRow = (userId: string, name: string) =>
    sqlite
      .prepare(
        `SELECT kind, is_paycheck, parent_id, merged_into_id FROM categories
         WHERE user_id = ? AND name = ?`,
      )
      .all(userId, name);

  const addCategory = (
    id: string,
    userId: string,
    name: string,
    kind: string,
    mergedInto: string | null = null,
  ) =>
    sqlite
      .prepare(
        `INSERT INTO categories
           (id, user_id, name, kind, merged_into_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, userId, name, kind, mergedInto, at, at);

  it('adds Interest and Tax refund to users from before it', () => {
    migrateFrom(migrationsUpTo('0010'));
    insertUser('u1');
    insertUser('u2');
    // Already has an income category with that name, in other case.
    sqlite
      .prepare(
        "UPDATE categories SET name = 'interest' WHERE user_id = 'u2' AND name = 'Other income'",
      )
      .run();
    // A merged category does not count as having the name.
    addCategory('into', 'u1', 'Windfall', 'income');
    addCategory('gone', 'u1', 'Tax refund', 'income', 'into');

    expect(migrateFrom(repoMigrations)).toEqual([
      '0011_income_categories',
      '0012_ious',
      '0013_reminders',
      '0014_entry_order_time',
      '0015_entry_replacements',
      '0016_buffer_currency',
      '0017_implied_rates',
      '0018_entry_client',
      '0019_goals',
    ]);

    expect(incomeRow('u1', 'Interest')).toEqual([
      { kind: 'income', is_paycheck: 0, parent_id: null, merged_into_id: null },
    ]);
    expect(incomeRow('u1', 'Tax refund')).toHaveLength(2);
    expect(incomeRow('u2', 'Tax refund')).toHaveLength(1);
    // u2 kept its own lower-case one and did not get a second.
    expect(
      count(
        "SELECT count(*) FROM categories WHERE user_id = 'u2' AND lower(name) = 'interest'",
      ),
    ).toBe(1);
  });

  it('skips a name held by an expense category', () => {
    migrateFrom(migrationsUpTo('0010'));
    insertUser('u1');
    addCategory('x', 'u1', 'Interest', 'expense');

    migrateFrom(repoMigrations);

    expect(incomeRow('u1', 'Interest')).toEqual([
      {
        kind: 'expense',
        is_paycheck: 0,
        parent_id: null,
        merged_into_id: null,
      },
    ]);
    expect(incomeRow('u1', 'Tax refund')).toHaveLength(1);
  });

  it('gives every new user the same set, with no paycheck among them', () => {
    migrateFrom(repoMigrations);
    insertUser('u1');
    expect(categoryTree('u1')).toEqual(starterTree);
    expect(
      sqlite
        .prepare(
          "SELECT name FROM categories WHERE user_id = 'u1' AND is_paycheck = 1",
        )
        .pluck()
        .all(),
    ).toEqual(['Paycheck']);
    expect(incomeRow('u1', 'Tax refund')).toEqual([
      { kind: 'income', is_paycheck: 0, parent_id: null, merged_into_id: null },
    ]);
  });
});

describe('migration 0013_reminders', () => {
  const reminder = (id: string, user: string, key: string, kind = 'bill_due') =>
    sqlite
      .prepare(
        `INSERT INTO reminders
           (id, user_id, kind, dedupe_key, title, body, url, created_at)
         VALUES (?, ?, ?, ?, 'Rent is due', 'Set aside', '/budget', ?)`,
      )
      .run(id, user, kind, key, at);
  const subscription = (id: string, user: string, endpoint: string) =>
    sqlite
      .prepare(
        `INSERT INTO push_subscriptions
           (id, user_id, endpoint, p256dh, auth, created_at)
         VALUES (?, ?, ?, 'key', 'secret', ?)`,
      )
      .run(id, user, endpoint, at);

  it('applies to a database at 0012 with data and leaves it alone', () => {
    migrateFrom(migrationsUpTo('0012'));
    insertUser('u1');
    insertAccount('card', 'u1', 'USD');

    expect(migrateFrom(repoMigrations)).toEqual([
      '0013_reminders',
      '0014_entry_order_time',
      '0015_entry_replacements',
      '0016_buffer_currency',
      '0017_implied_rates',
      '0018_entry_client',
      '0019_goals',
    ]);
    expect(count('SELECT count(*) FROM accounts')).toBeGreaterThan(0);
    expect(count('SELECT count(*) FROM reminders')).toBe(0);
    expect(count('SELECT count(*) FROM push_subscriptions')).toBe(0);
  });

  it('records a reminder once per user and key', () => {
    migrateFrom(repoMigrations);
    insertUser('u1');
    insertUser('u2');
    reminder('r1', 'u1', 'bill:rent:2026-03-16');
    expect(() => reminder('r2', 'u1', 'bill:rent:2026-03-16')).toThrow(
      /UNIQUE/,
    );
    reminder('r3', 'u2', 'bill:rent:2026-03-16');
    expect(() => reminder('r4', 'u1', 'x', 'gossip')).toThrow(/CHECK/);
  });

  it('keeps a subscription to https, one row per endpoint, and goes with the user', () => {
    migrateFrom(repoMigrations);
    insertUser('u1');
    subscription('s1', 'u1', 'https://push.example.test/a');
    expect(() =>
      subscription('s2', 'u1', 'https://push.example.test/a'),
    ).toThrow(/UNIQUE/);
    expect(() =>
      subscription('s3', 'u1', 'http://push.example.test/b'),
    ).toThrow(/CHECK/);
    reminder('r1', 'u1', 'k');
    sqlite.exec("DELETE FROM users WHERE id = 'u1'");
    expect(count('SELECT count(*) FROM push_subscriptions')).toBe(0);
    expect(count('SELECT count(*) FROM reminders')).toBe(0);
  });
});

describe('migration 0014_entry_order_time', () => {
  const entry = (id: string, user: string, on: string, createdAt: string) =>
    sqlite
      .prepare(
        `INSERT INTO transactions (id, user_id, kind, occurred_on, created_at, source)
         VALUES (?, ?, 'expense', ?, ?, 'api')`,
      )
      .run(id, user, on, createdAt);
  const ranked = (user: string, on: string) =>
    sqlite
      .prepare(
        `SELECT transaction_id FROM transaction_ranks
         WHERE user_id = ? AND occurred_on = ? ORDER BY sort_rank`,
      )
      .pluck()
      .all(user, on);

  it('ranks the entries of a database at 0013 in the order they had', () => {
    migrateFrom(migrationsUpTo('0013'));
    insertUser('u1');
    insertUser('u2');
    entry('b', 'u1', '2026-01-05', '2026-01-05T10:00:00.000Z');
    entry('a', 'u1', '2026-01-05', '2026-01-05T09:00:00.000Z');
    entry('d', 'u1', '2026-01-05', '2026-01-05T09:00:00.000Z');
    entry('c', 'u1', '2026-01-06', '2026-01-04T00:00:00.000Z');
    entry('e', 'u2', '2026-01-05', '2026-01-05T08:00:00.000Z');
    for (let i = 0; i < 11; i += 1) {
      entry(
        `n${String(i)}`,
        'u2',
        '2026-01-07',
        `2026-01-07T00:00:${String(i).padStart(2, '0')}.000Z`,
      );
    }

    expect(migrateFrom(migrationsUpTo('0014'))).toEqual([
      '0014_entry_order_time',
    ]);
    expect(ranked('u1', '2026-01-05')).toEqual(['a', 'd', 'b']);
    expect(ranked('u1', '2026-01-06')).toEqual(['c']);
    expect(ranked('u2', '2026-01-05')).toEqual(['e']);
    expect(ranked('u2', '2026-01-07')).toEqual(
      Array.from({ length: 11 }, (_, i) => `n${String(i)}`),
    );
    expect(
      sqlite
        .prepare(
          "SELECT sort_rank FROM transaction_ranks WHERE transaction_id = 'a'",
        )
        .pluck()
        .get(),
    ).toBe('000001V');
  });

  describe('on a fresh database', () => {
    beforeEach(() => {
      migrateFrom(repoMigrations);
      insertUser('u1');
      insertUser('u2');
      entry('t1', 'u1', '2026-01-05', at);
    });

    const rank = (id: string, user: string, key: string) =>
      sqlite
        .prepare(
          `INSERT INTO transaction_ranks
             (transaction_id, user_id, occurred_on, sort_rank, updated_at)
           VALUES (?, ?, '2026-01-05', ?, ?)`,
        )
        .run(id, user, key, at);

    it('takes a time of day only as HH:MM', () => {
      const timed = (id: string, time: string) =>
        sqlite
          .prepare(
            `INSERT INTO transactions
               (id, user_id, kind, occurred_on, occurred_time, created_at, source)
             VALUES (?, 'u1', 'expense', '2026-01-05', ?, ?, 'api')`,
          )
          .run(id, time, at);
      timed('ok', '23:59');
      expect(() => timed('late', '24:00')).toThrow(/CHECK/);
      expect(() => timed('short', '9:05')).toThrow(/CHECK/);
      expect(() => timed('seconds', '09:05:00')).toThrow(/CHECK/);
    });

    it('still refuses to change an entry, its time included', () => {
      expect(() =>
        sqlite
          .prepare(
            "UPDATE transactions SET occurred_time = '09:00' WHERE id = 't1'",
          )
          .run(),
      ).toThrow(/append-only/);
    });

    it("keeps ranks to valid keys in the entry's own user", () => {
      expect(() => rank('t1', 'u1', 'A0')).toThrow(/CHECK/);
      expect(() => rank('t1', 'u1', 'A-')).toThrow(/CHECK/);
      expect(() => rank('t1', 'u1', '')).toThrow(/CHECK/);
      expect(() => rank('t1', 'u2', 'V')).toThrow(/FOREIGN KEY/);
      rank('t1', 'u1', 'V');
    });

    it('lets the rank move but not the entry or day it belongs to', () => {
      rank('t1', 'u1', 'V');
      sqlite
        .prepare(
          "UPDATE transaction_ranks SET sort_rank = 'W' WHERE transaction_id = 't1'",
        )
        .run();
      expect(() =>
        sqlite
          .prepare(
            "UPDATE transaction_ranks SET occurred_on = '2026-01-06' WHERE transaction_id = 't1'",
          )
          .run(),
      ).toThrow(/stays with its entry/);
    });

    it('goes with its user', () => {
      rank('t1', 'u1', 'V');
      sqlite.prepare("DELETE FROM users WHERE id = 'u1'").run();
      expect(count('SELECT count(*) FROM transaction_ranks')).toBe(0);
    });
  });
});

describe('migration 0015_entry_replacements', () => {
  const entry = (
    id: string,
    user: string,
    createdAt: string,
    reverses: string | null = null,
  ) =>
    sqlite
      .prepare(
        `INSERT INTO transactions
           (id, user_id, kind, occurred_on, created_at, source, reverses_id)
         VALUES (?, ?, ?, '2026-01-05', ?, 'api', ?)`,
      )
      .run(
        id,
        user,
        reverses === null ? 'expense' : 'reversal',
        createdAt,
        reverses,
      );
  const pairs = () =>
    sqlite
      .prepare(
        `SELECT original_id || '>' || replacement_id
         FROM transaction_replacements ORDER BY original_id`,
      )
      .pluck()
      .all();

  it('finds the edits of a database at 0014 and leaves deletes as they were', () => {
    migrateFrom(migrationsUpTo('0014'));
    insertUser('u1');
    insertUser('u2');
    // Edited: the undo and the new entry share their created_at.
    entry('a', 'u1', '2026-01-05T09:00:00.000Z');
    entry('a-undo', 'u1', '2026-01-05T10:00:00.000Z', 'a');
    entry('a2', 'u1', '2026-01-05T10:00:00.000Z');
    // Deleted.
    entry('b', 'u1', '2026-01-05T09:00:00.000Z');
    entry('b-undo', 'u1', '2026-01-05T11:00:00.000Z', 'b');
    // Deleted, then another entry recorded in the same instant by another
    // user: still a delete.
    entry('c', 'u1', '2026-01-05T09:00:00.000Z');
    entry('c-undo', 'u1', '2026-01-05T12:00:00.000Z', 'c');
    entry('x', 'u2', '2026-01-05T12:00:00.000Z');
    // Too many entries in that instant to tell: left as a delete.
    entry('d', 'u1', '2026-01-05T09:00:00.000Z');
    entry('d-undo', 'u1', '2026-01-05T13:00:00.000Z', 'd');
    entry('d2', 'u1', '2026-01-05T13:00:00.000Z');
    entry('d3', 'u1', '2026-01-05T13:00:00.000Z');

    expect(migrateFrom(repoMigrations)).toEqual([
      '0015_entry_replacements',
      '0016_buffer_currency',
      '0017_implied_rates',
      '0018_entry_client',
      '0019_goals',
    ]);
    expect(pairs()).toEqual(['a>a2']);
  });

  describe('on a fresh database', () => {
    beforeEach(() => {
      migrateFrom(repoMigrations);
      insertUser('u1');
      insertUser('u2');
      entry('t1', 'u1', at);
      entry('t2', 'u1', at);
      entry('t3', 'u1', at);
      entry('o1', 'u2', at);
    });

    const replace = (original: string, replacement: string, user = 'u1') =>
      sqlite
        .prepare(
          `INSERT INTO transaction_replacements
             (replacement_id, original_id, user_id) VALUES (?, ?, ?)`,
        )
        .run(replacement, original, user);

    it("replaces an entry once, with one of the same user's", () => {
      replace('t1', 't2');
      expect(() => replace('t1', 't3')).toThrow(/UNIQUE/);
      expect(() => replace('t3', 't3')).toThrow(/CHECK/);
      expect(() => replace('t2', 'o1')).toThrow(/FOREIGN KEY/);
    });

    it('never changes a recorded replacement', () => {
      replace('t1', 't2');
      expect(() =>
        sqlite
          .prepare("UPDATE transaction_replacements SET replacement_id = 't3'")
          .run(),
      ).toThrow(/append-only/);
      expect(() =>
        sqlite.prepare('DELETE FROM transaction_replacements').run(),
      ).toThrow(/append-only/);
    });

    it('goes with its user', () => {
      replace('t1', 't2');
      sqlite.prepare("DELETE FROM users WHERE id = 'u1'").run();
      expect(count('SELECT count(*) FROM transaction_replacements')).toBe(0);
    });
  });
});

describe('migration 0016_buffer_currency', () => {
  const sql = (text: string) => sqlite.prepare(text);
  const amountRows = () =>
    sql(
      'SELECT budget_id, amount_minor, currency FROM budget_amounts ORDER BY id',
    ).all();

  it('moves the empty amounts of a database at 0015 to the default currency', () => {
    migrateFrom(migrationsUpTo('0015'));
    insertUser('u1');
    insertUser('u2');
    // u1 chose EUR in setup after signing up in USD; u2 never changed it.
    sql("UPDATE users SET default_currency = 'EUR' WHERE id = 'u1'").run();
    sql(
      `INSERT INTO tags (id, user_id, name, created_at, updated_at)
       VALUES ('g1', 'u1', 'trip', ?, ?)`,
    ).run(at, at);
    sql(
      `INSERT INTO budgets
         (id, user_id, name, kind, tag_id, mode, leftover, started_on, created_at, updated_at)
       VALUES ('plan', 'u1', 'Rent', 'tag', 'g1', 'daily', 'free', '2026-01-01', ?, ?)`,
    ).run(at, at);
    // A planned amount in the old currency is kept; it converts when read.
    sql(
      `INSERT INTO budget_amounts
         (id, user_id, budget_id, effective_on, amount_minor, currency, created_at)
       SELECT 'planned', 'u1', id, '2026-01-02', 50000, 'USD', ?
       FROM budgets WHERE user_id = 'u1' AND kind = 'buffer'`,
    ).run(at);

    expect(migrateFrom(repoMigrations)).toEqual([
      '0016_buffer_currency',
      '0017_implied_rates',
      '0018_entry_client',
      '0019_goals',
    ]);

    expect(
      sql(
        `SELECT user_id, amount_minor, currency FROM budget_amounts
         ORDER BY user_id, amount_minor`,
      ).all(),
    ).toEqual([
      { user_id: 'u1', amount_minor: 0, currency: 'EUR' },
      { user_id: 'u1', amount_minor: 50000, currency: 'USD' },
      { user_id: 'u2', amount_minor: 0, currency: 'USD' },
    ]);
    expect(amountRows()).toHaveLength(3);
  });

  describe('on a fresh database', () => {
    beforeEach(() => {
      migrateFrom(repoMigrations);
      insertUser('u1');
    });

    it('lets the Buffer start move, and nothing else about it', () => {
      sql(
        "UPDATE budgets SET started_on = '2026-01-02' WHERE kind = 'buffer'",
      ).run();
      expect(() =>
        sql("UPDATE budgets SET user_id = 'u2' WHERE kind = 'buffer'").run(),
      ).toThrow(/fixed/);
    });

    it('still fixes the start of any other budget', () => {
      sql(
        `INSERT INTO tags (id, user_id, name, created_at, updated_at)
         VALUES ('g1', 'u1', 'trip', ?, ?)`,
      ).run(at, at);
      sql(
        `INSERT INTO budgets
           (id, user_id, name, kind, tag_id, mode, leftover, started_on, created_at, updated_at)
         VALUES ('plan', 'u1', 'Trips', 'tag', 'g1', 'daily', 'free', '2026-01-01', ?, ?)`,
      ).run(at, at);
      expect(() =>
        sql(
          "UPDATE budgets SET started_on = '2026-01-02' WHERE id = 'plan'",
        ).run(),
      ).toThrow(/fixed/);
    });
  });
});

describe('migration 0017_implied_rates', () => {
  const sql = (text: string) => sqlite.prepare(text);

  it('keeps the rates of a database at 0016 and accepts implied ones', () => {
    migrateFrom(migrationsUpTo('0016'));
    insertUser('u1');
    sql(
      `INSERT INTO fx_rates (id, user_id, base, quote, rate, as_of, source, created_at)
       VALUES ('r1', 'u1', 'USD', 'EUR', '0.92', '2026-03-10', 'manual', ?)`,
    ).run(at);

    expect(migrateFrom(migrationsUpTo('0017'))).toEqual(['0017_implied_rates']);

    expect(sql('SELECT id, rate, source FROM fx_rates').all()).toEqual([
      { id: 'r1', rate: '0.92', source: 'manual' },
    ]);
    sql(
      `INSERT INTO fx_rates (id, user_id, base, quote, rate, as_of, source, created_at)
       VALUES ('r2', 'u1', 'USD', 'EUR', '0.9', '2026-03-11', 'implied', ?)`,
    ).run(at);
    expect(() =>
      sql(
        `INSERT INTO fx_rates (id, user_id, base, quote, rate, as_of, source, created_at)
         VALUES ('r3', 'u1', 'USD', 'EUR', '0.9', '2026-03-12', 'guessed', ?)`,
      ).run(at),
    ).toThrow();
  });
});

describe('migration 0018_entry_client', () => {
  const sql = (text: string) => sqlite.prepare(text);

  it('leaves earlier entries without a client and limits it to api entries', () => {
    migrateFrom(migrationsUpTo('0017'));
    insertUser('u1');
    insertTransaction('t1', 'u1');

    expect(migrateFrom(repoMigrations)).toEqual([
      '0018_entry_client',
      '0019_goals',
    ]);

    expect(sql('SELECT id, client FROM transactions').all()).toEqual([
      { id: 't1', client: null },
    ]);
    const add = (id: string, source: string, client: string) =>
      sql(
        `INSERT INTO transactions (id, user_id, kind, occurred_on, created_at, source, client)
         VALUES (?, 'u1', 'expense', '2026-01-05', ?, ?, ?)`,
      ).run(id, at, source, client);
    add('t2', 'api', 'web');
    add('t3', 'api', 'chat');
    expect(() => add('t4', 'api', 'toaster')).toThrow();
    expect(() => add('t5', 'import', 'web')).toThrow();
  });
});

describe('migration 0019_goals', () => {
  const sql = (text: string) => sqlite.prepare(text);

  function addGoal(id: string, fields: { pool?: string; account?: string }) {
    sql(
      `INSERT INTO goals
         (id, user_id, name, pool_id, account_id, target_minor, currency, created_at, updated_at)
       VALUES (?, 'u1', ?, ?, ?, 1000, 'USD', ?, ?)`,
    ).run(
      id,
      `Goal ${id}`,
      fields.pool ?? null,
      fields.account ?? null,
      at,
      at,
    );
  }

  it('needs exactly one target, one goal per target, and fixes the target', () => {
    migrateFrom(repoMigrations);
    insertUser('u1');
    insertAccount('a1', 'u1', 'USD', { group: 'off' });
    const pool = sql(
      `SELECT id FROM pools WHERE user_id = 'u1' AND default_for = 'off'`,
    ).get() as { id: string };

    expect(() => {
      addGoal('g0', {});
    }).toThrow();
    expect(() => {
      addGoal('g0', { pool: pool.id, account: 'a1' });
    }).toThrow();
    addGoal('g1', { pool: pool.id });
    expect(() => {
      addGoal('g2', { pool: pool.id });
    }).toThrow();
    addGoal('g3', { account: 'a1' });
    expect(() => {
      addGoal('g4', { account: 'a1' });
    }).toThrow();

    sql(`UPDATE goals SET archived = 1 WHERE id = 'g1'`).run();
    addGoal('g5', { pool: pool.id });
    expect(() =>
      sql(
        `UPDATE goals SET pool_id = NULL, account_id = 'a1' WHERE id = 'g5'`,
      ).run(),
    ).toThrow();
    expect(() =>
      sql(`UPDATE goals SET currency = 'EUR' WHERE id = 'g5'`).run(),
    ).toThrow();
    expect(() =>
      sql(`UPDATE goals SET target_minor = 0 WHERE id = 'g5'`).run(),
    ).toThrow();
  });
});
