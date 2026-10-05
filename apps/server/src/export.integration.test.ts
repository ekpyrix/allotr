import { bundleSchema } from '@allotr/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import {
  checkpointsWithSteps,
  joinedAt,
  loadFixtures,
  runStep,
} from './testing/replay.ts';
import { startWithTwoUsers, userIdOf, type TwoUsers } from './testing/users.ts';

// Export (#67): the JSON bundle imports back on an empty ledger with the
// same balances and figures; CSV and Beancount list every posting and each
// Beancount entry balances per currency. Names and amounts are made up.

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// Ids differ between users; `amended` needs the undo history, which the
// bundle does not carry.
function comparable(value: unknown): Json {
  if (Array.isArray(value)) return value.map(comparable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) => !/(^id$|Id$|Ids$|^amended$|^createdAt$|^openedBy$)/.test(k),
        )
        .map(([k, v]) => [k, comparable(v)]),
    );
  }
  return value as Json;
}

// Refs are entry ids, and entries imported together share a time of entry,
// so their order within a day follows random ids.
function normalised(bundle: unknown): unknown {
  const plain = JSON.parse(
    JSON.stringify(bundle, (key, value: unknown) =>
      (key === 'ref' || key === 'transaction' || key === 'adjustment') &&
      typeof value === 'string'
        ? 'ref'
        : value,
    ),
  ) as { transactions: unknown[] };
  plain.transactions = plain.transactions
    .map((t) => JSON.stringify(t))
    .sort()
    .map((t) => JSON.parse(t) as unknown);
  return plain;
}

async function download(client: TestClient, format: string) {
  const response = await client.get(`/v1/export?format=${format}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response;
}

async function figures(client: TestClient) {
  const [accounts, today, cycles, budgets, pools] = await Promise.all([
    client.get('/v1/accounts?includeArchived=true'),
    client.get('/v1/today'),
    client.get('/v1/cycles'),
    client.get('/v1/budgets'),
    client.get('/v1/pools?includeArchived=true'),
  ]);
  // Accounts made in the same instant list in id order, and the export
  // renames an archived account whose name was reused.
  const { accounts: list, ...totals } = accounts.body as {
    accounts: { name: string; archived: boolean }[];
  };
  const named = list.map((a) => ({
    ...a,
    name: a.archived ? a.name.replace(/ \(archived( \d+)?\)$/, '') : a.name,
  }));
  return comparable({
    accounts: named.sort(
      (x, y) =>
        x.name.localeCompare(y.name) || Number(x.archived) - Number(y.archived),
    ),
    totals,
    today: today.body,
    cycles: cycles.body,
    budgets: budgets.body,
    pools: pools.body,
  });
}

/** Sums of each Beancount transaction's postings, per currency. */
function beancountSums(text: string): Map<string, bigint>[] {
  const sums: Map<string, bigint>[] = [];
  let current: Map<string, bigint> | null = null;
  for (const line of text.split('\n')) {
    if (/^\d{4}-\d{2}-\d{2} \* /.test(line)) {
      current = new Map();
      sums.push(current);
      continue;
    }
    const posting = /^ {2}[A-Z]\S* {2}(-?\d+(?:\.\d+)?) ([A-Z]{3})$/.exec(line);
    if (posting === null || current === null) continue;
    const [, amount = '', currency = ''] = posting;
    const [whole = '0', fraction = ''] = amount.replace('-', '').split('.');
    // Scale to a common 1e6 so any minor unit adds exactly.
    const minor = BigInt(whole + fraction.padEnd(6, '0'));
    current.set(
      currency,
      (current.get(currency) ?? 0n) + (amount.startsWith('-') ? -minor : minor),
    );
  }
  return sums;
}

function postingCount(bundleText: string): number {
  return bundleText.split('\n').length;
}

const fixtures = loadFixtures();

for (const fixture of fixtures) {
  describe(`export of ${fixture.name}`, () => {
    const last = checkpointsWithSteps(fixture.replay).at(-1);
    const clock = { now: new Date(joinedAt(fixture.replay)) };
    let h: TwoUsers;

    beforeAll(async () => {
      h = await startWithTwoUsers({ now: () => clock.now });
      // Both users joined the same day, so the first cycle starts alike.
      for (const client of [h.alice, h.bob]) {
        await h.db
          .updateTable('users')
          .set({ created_at: joinedAt(fixture.replay) })
          .where('id', '=', await userIdOf(client))
          .execute();
      }
      const imported = await h.alice.post('/v1/import', fixture.bundle);
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);
      for (const step of fixture.replay.steps) {
        clock.now = new Date(step.at);
        await runStep(h.alice, step);
      }
      clock.now = new Date(last?.checkpoint.at ?? joinedAt(fixture.replay));
    });

    afterAll(async () => {
      await h.close();
    });

    it('imports back with the same balances and figures', async () => {
      const exported = await download(h.alice, 'json');
      expect(exported.headers.get('content-disposition')).toMatch(
        /^attachment; filename="allotr-export-\d{4}-\d{2}-\d{2}\.json"$/,
      );
      expect(bundleSchema.safeParse(exported.body).success).toBe(true);

      const imported = await h.bob.post('/v1/import', exported.body);
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);
      expect(await figures(h.bob)).toEqual(await figures(h.alice));

      const again = await download(h.bob, 'json');
      expect(normalised(again.body)).toEqual(normalised(exported.body));
    });

    it('writes Beancount entries that balance per currency', async () => {
      const response = await download(h.alice, 'beancount');
      const sums = beancountSums(response.body as string);
      expect(sums.length).toBeGreaterThan(0);
      for (const perCurrency of sums) {
        for (const total of perCurrency.values()) expect(total).toBe(0n);
      }
    });

    it('writes one CSV row per posting', async () => {
      const response = await download(h.alice, 'csv');
      expect(response.headers.get('content-type')).toMatch(/^text\/csv/);
      const text = response.body as string;
      // Every posting, edits' earlier versions included, which the list
      // leaves out.
      const postings = (
        await h.db
          .selectFrom('postings')
          .select(h.db.fn.countAll<number>().as('n'))
          .where('user_id', '=', await userIdOf(h.alice))
          .executeTakeFirstOrThrow()
      ).n;
      // The header, one line per posting, and the final line end.
      expect(postingCount(text)).toBe(postings + 2);
      expect(text.startsWith('date,entry_id,kind,account,amount,')).toBe(true);
    });
  });
}

describe('export of archive, switches, merges and reconciliations', () => {
  const clock = { now: new Date('2026-04-01T08:00:00Z') };
  let h: TwoUsers;

  const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });

  beforeAll(async () => {
    h = await startWithTwoUsers({ now: () => clock.now });
    for (const client of [h.alice, h.bob]) {
      await h.db
        .updateTable('users')
        .set({ created_at: '2026-04-01T12:00:00.000Z' })
        .where('id', '=', await userIdOf(client))
        .execute();
    }
    const a = h.alice;
    await a.patch('/v1/settings/ledger', { defaultCurrency: 'EUR' });
    const create = async (body: Record<string, unknown>) => {
      clock.now = new Date(clock.now.getTime() + 60_000);
      const r = await a.post('/v1/accounts', body);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return (r.body as { id: string }).id;
    };
    const wallet = await create({
      name: 'Wallet',
      currency: 'EUR',
      openingBalance: eur(50_000),
      openedOn: '2026-04-01',
    });
    const old = await create({
      name: 'Old',
      currency: 'EUR',
      openingBalance: eur(3_000),
      openedOn: '2026-04-01',
    });
    const box = await create({
      name: 'Box / tin',
      currency: 'EUR',
      budgetGroup: 'off',
      openingBalance: eur(1_000),
      openedOn: '2026-04-01',
    });

    const cats = await a.get('/v1/categories');
    const byName = (name: string) =>
      (
        cats.body as { categories: { id: string; name: string }[] }
      ).categories.find((c) => c.name === name)?.id ?? '';
    const spend = async (note: string, amount: number, category: string) => {
      clock.now = new Date(clock.now.getTime() + 60_000);
      const r = await a.post('/v1/transactions', {
        kind: 'expense',
        accountId: wallet,
        amount: eur(amount),
        categoryId: byName(category),
        occurredOn: '2026-04-03',
        note,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return (r.body as { id: string }).id;
    };
    await spend('Film', 1_200, 'Fun');
    const lunch = await spend('Lunch', 900, 'Eating out');
    const tea = await spend('Tea', 300, 'Shopping');
    expect((await a.post(`/v1/transactions/${tea}/reverse`)).status).toBe(201);
    const edited = await a.post(`/v1/transactions/${lunch}/edit`, {
      kind: 'expense',
      accountId: wallet,
      amount: eur(950),
      categoryId: byName('Eating out'),
      occurredOn: '2026-04-03',
      note: 'Lunch',
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(201);
    // Entries on Fun now file under Other.
    expect(
      (
        await a.delete(
          `/v1/categories/${byName('Fun')}?mergeInto=${byName('Other')}`,
        )
      ).status,
    ).toBe(204);

    clock.now = new Date('2026-04-05T12:00:00Z');
    expect(
      (await a.patch(`/v1/accounts/${box}`, { budgetGroup: 'on' })).status,
    ).toBe(200);
    clock.now = new Date('2026-04-07T12:00:00Z');
    expect(
      (
        await a.post(`/v1/accounts/${old}/archive`, {
          settle: { method: 'write_off' },
        })
      ).status,
    ).toBe(200);
    // The name is free again.
    await create({ name: 'Old', currency: 'EUR' });

    const bill = await a.post('/v1/bills', {
      name: 'Phone',
      accountId: wallet,
      amount: eur(2_000),
      dueDay: 8,
    });
    expect(bill.status, JSON.stringify(bill.body)).toBe(201);
    clock.now = new Date('2026-04-10T12:00:00Z');
    expect(
      (
        await a.post(`/v1/accounts/${wallet}/reconcile`, {
          balance: eur(47_000),
          on: '2026-04-09',
          adjust: true,
        })
      ).status,
    ).toBe(200);
  });

  afterAll(async () => {
    await h.close();
  });

  it('imports back with the same accounts, figures and reconciled days', async () => {
    const exported = await download(h.alice, 'json');
    const bundle = bundleSchema.parse(exported.body);
    expect(bundle.accounts.map((a) => [a.name, a.archived ?? false])).toEqual([
      ['Wallet', false],
      ['Old (archived)', true],
      ['Box / tin', false],
      ['Old', false],
    ]);
    expect(bundle.accounts[2]?.switches).toEqual([
      { on: '2026-04-05', budgetGroup: 'on' },
    ]);
    // Tea was undone and the first Lunch replaced; Film follows the merge.
    expect(
      bundle.transactions.map((t) => [
        t.kind,
        t.kind === 'expense' ? t.category : undefined,
        t.kind === 'write_off' ? t.balance.amountMinor : t.note,
      ]),
    ).toEqual([
      ['expense', 'Other', 'Film'],
      ['expense', 'Food/Eating out', 'Lunch'],
      ['write_off', undefined, 3_000],
      ['expense', 'Unrecorded', undefined],
    ]);
    expect(bundle.reconciliations).toHaveLength(1);

    const imported = await h.bob.post('/v1/import', exported.body);
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    expect(await figures(h.bob)).toEqual(await figures(h.alice));
    const accounts = await h.bob.get('/v1/accounts');
    expect(
      (
        accounts.body as {
          accounts: { name: string; lastReconciledOn: string | null }[];
        }
      ).accounts.find((a) => a.name === 'Wallet')?.lastReconciledOn,
    ).toBe('2026-04-09');
  });

  it('refuses to archive an imported account that does not end at zero', async () => {
    const other = await startWithTwoUsers();
    try {
      const response = await other.alice.post('/v1/import', {
        format: 'allotr.bundle',
        version: 1,
        accounts: [
          {
            name: 'Jar',
            currency: 'EUR',
            openingBalance: eur(500),
            openedOn: '2026-04-01',
            archived: true,
          },
        ],
      });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'account_not_empty',
        errors: [{ path: '/accounts/0/archived' }],
      });
    } finally {
      await other.close();
    }
  });

  it('lists undos in Beancount, balanced per currency', async () => {
    const text = (await download(h.alice, 'beancount')).body as string;
    expect(text).toContain('custom "allotr-budget-group" Assets:Box-tin "on"');
    expect(text).toMatch(/\d{4}-\d{2}-\d{2} close Assets:Old-2\n/);
    expect(text).toContain('  reverses: "');
    for (const perCurrency of beancountSums(text)) {
      for (const total of perCurrency.values()) expect(total).toBe(0n);
    }
  });

  it('refuses an unknown format', async () => {
    expect((await h.alice.get('/v1/export?format=xlsx')).status).toBe(400);
  });

  it('is only for signed-in users', async () => {
    const response = await fetch(`${h.server.url}/v1/export`);
    expect(response.status).toBe(401);
  });
});
