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
// 0007_pools.sql, 0008_budgets.sql, 0009_budget_cover.sql and
// 0010_category_style.sql against real SQLite.

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
    expect(migrateFrom(repoMigrations)).toEqual(['0009_budget_cover']);
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

    expect(migrateFrom(repoMigrations)).toEqual(['0010_category_style']);

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
