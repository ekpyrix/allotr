import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// The Buffer follows the currency and time zone setup chooses (issue #210).
// All amounts are made up.

type Money = { amountMinor: number; currency: string };
type Status = { budgets: { id: string; name: string; amount: Money }[] };

// 23:30 UTC on 14 March is already the 15th in Tokyo.
const started = new Date('2026-03-14T23:30:00Z');
let h: TwoUsers;

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => started });
  await h.db
    .updateTable('users')
    .set({ created_at: started.toISOString() })
    .execute();
  // Sign-up seeded the Buffer on the UTC day.
  await h.db
    .updateTable('budgets')
    .set({ created_at: started.toISOString(), started_on: '2026-03-14' })
    .where('kind', '=', 'buffer')
    .execute();
  await h.db
    .updateTable('budget_amounts')
    .set({ effective_on: '2026-03-14', currency: 'USD' })
    .execute();
});

afterAll(async () => {
  await h.close();
});

async function buffer(): Promise<Status['budgets'][number]> {
  const status = (await h.alice.get('/v1/budgets')).body as Status;
  const found = status.budgets.find((b) => b.name === 'Buffer');
  if (found === undefined) throw new Error('no Buffer');
  return found;
}

async function seed() {
  return h.db
    .selectFrom('budget_amounts as a')
    .innerJoin('budgets as b', 'b.id', 'a.budget_id')
    .select(['a.currency', 'a.effective_on', 'b.started_on'])
    .where('b.user_id', '=', await userId())
    .where('b.kind', '=', 'buffer')
    .execute();
}

async function userId(): Promise<string> {
  const row = await h.db
    .selectFrom('users')
    .select('id')
    .where('email', '=', 'alice@example.test')
    .executeTakeFirstOrThrow();
  return row.id;
}

describe('the Buffer after setup', () => {
  it('starts in the sign-up currency on the UTC day', async () => {
    expect(await seed()).toEqual([
      { currency: 'USD', effective_on: '2026-03-14', started_on: '2026-03-14' },
    ]);
  });

  it('moves to the new default currency and local day, and can be planned', async () => {
    const saved = await h.alice.patch('/v1/settings/ledger', {
      defaultCurrency: 'EUR',
      timeZone: 'Asia/Tokyo',
    });
    expect(saved.status).toBe(200);
    expect(await seed()).toEqual([
      { currency: 'EUR', effective_on: '2026-03-15', started_on: '2026-03-15' },
    ]);
    expect((await buffer()).amount).toEqual({
      amountMinor: 0,
      currency: 'EUR',
    });

    const planned = await h.alice.patch(`/v1/budgets/${(await buffer()).id}`, {
      amount: { amountMinor: 50_000, currency: 'EUR' },
    });
    expect(planned.status).toBe(200);
    expect((await buffer()).amount).toEqual({
      amountMinor: 50_000,
      currency: 'EUR',
    });
  });

  it('keeps the planned amount when the currency changes again', async () => {
    const saved = await h.alice.patch('/v1/settings/ledger', {
      defaultCurrency: 'GBP',
    });
    expect(saved.status).toBe(200);
    expect(await seed()).toEqual([
      { currency: 'EUR', effective_on: '2026-03-15', started_on: '2026-03-15' },
    ]);
    expect((await buffer()).amount.amountMinor).toBe(50_000);
  });
});
