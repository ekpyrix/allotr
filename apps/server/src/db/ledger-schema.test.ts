import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repoMigrations } from '../testing/database.ts';
import { migrate } from './migrate.ts';
import { openSqlite } from './sqlite.ts';

// Integration tests for migrations/0003_ledger.sql,
// 0004_bill_payments.sql and 0005_reconciliations.sql against real SQLite.

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

    expect(migrateFrom(repoMigrations)).toEqual(['0005_reconciliations']);

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

    it('has an adjustment exactly when the balances differ', () => {
      insertReconciliation('r1', { stated: 4000, adjustment: 't1' });
      expect(() => insertReconciliation('r2', { stated: 4000 })).toThrow(
        /CHECK/,
      );
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
