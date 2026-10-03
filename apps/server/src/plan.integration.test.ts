import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestClient } from './testing/http-client.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// The payday plan and insights through the API against real SQLite and
// migrations (ADR 0021). The clock is fixed to 2 April 2026 and payday is the
// 1st. All names and amounts are made up.

type Money = { amountMinor: number; currency: string };

const now = new Date('2026-04-02T12:00:00Z');
let h: TwoUsers;
let everyday = '';
let rainy = '';
const ids: Record<string, string> = {};

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' });

async function entry(client: TestClient, body: Record<string, unknown>) {
  const response = await client.post('/v1/transactions', body);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
}

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => now });
  await h.db
    .updateTable('users')
    .set({ created_at: '2026-02-18T09:00:00.000Z' })
    .execute();
  const open = async (name: string, amountMinor: number, group: string) =>
    (
      (
        await h.alice.post('/v1/accounts', {
          name,
          currency: 'USD',
          budgetGroup: group,
          openingBalance: usd(amountMinor),
          openedOn: '2026-02-18',
        })
      ).body as { id: string }
    ).id;
  everyday = await open('Everyday', 300_000, 'on');
  rainy = await open('Rainy day', 80_000, 'off');
  const categories = (
    (await h.alice.get('/v1/categories')).body as {
      categories: { id: string; name: string }[];
    }
  ).categories;
  for (const name of ['Food', 'Paycheck'])
    ids[name] = categories.find((c) => c.name === name)?.id ?? '';
  ids.Travel = (
    (await h.alice.post('/v1/categories', { name: 'Travel', kind: 'expense' }))
      .body as { id: string }
  ).id;
  const spend = (on: string, category: string, amountMinor: number) =>
    entry(h.alice, {
      kind: 'expense',
      accountId: everyday,
      amount: usd(amountMinor),
      categoryId: category,
      occurredOn: on,
    });
  const pay = (on: string) =>
    entry(h.alice, {
      kind: 'income',
      accountId: everyday,
      amount: usd(200_000),
      categoryId: ids.Paycheck,
      occurredOn: on,
    });
  await spend('2026-02-25', ids.Food ?? '', 30_000);
  await pay('2026-03-01');
  await spend('2026-03-10', ids.Food ?? '', 60_000);
  await spend('2026-03-12', ids.Travel, 12_000);
  await pay('2026-04-01');
  await spend('2026-04-02', ids.Food ?? '', 5_000);
});

afterAll(async () => {
  await h.close();
});

type Plan = {
  income: Money;
  savings: Money;
  toPlan: Money;
  historyCycles: number;
  lines: {
    budgetId: string | null;
    categoryId: string | null;
    current: Money;
    suggested: Money;
    prefill: Money;
  }[];
};

describe('payday plan', () => {
  it('suggests budgets from average spending over past cycles', async () => {
    const response = await h.alice.get('/v1/payday-plan');
    expect(response.status).toBe(200);
    const plan = response.body as Plan;
    expect(plan.income).toEqual(usd(200_000));
    expect(plan.savings).toEqual(usd(0));
    expect(plan.historyCycles).toBe(2);
    const food = plan.lines.find((l) => l.categoryId === ids.Food);
    expect(food).toMatchObject({
      budgetId: null,
      suggested: usd(45_000),
      prefill: usd(45_000),
    });
    expect(
      plan.lines.find((l) => l.categoryId === ids.Travel)?.suggested,
    ).toEqual(usd(6_000));
  });

  it('puts the savings line first once a rule is set', async () => {
    const set = await h.alice.patch('/v1/settings/ledger', {
      payYourselfFirst: { kind: 'percent', basisPoints: 1_000 },
    });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({
      payYourselfFirst: { kind: 'percent', basisPoints: 1_000 },
    });
    const plan = (await h.alice.get('/v1/payday-plan')).body as Plan;
    expect(plan.savings).toEqual(usd(20_000));
    expect(plan.toPlan).toEqual(usd(180_000));
    const bad = await h.alice.patch('/v1/settings/ledger', {
      payYourselfFirst: { kind: 'percent', basisPoints: 20_000 },
    });
    expect(bad.status).toBe(400);
  });

  it('confirms in one step: budgets planned and the savings moved once', async () => {
    const plan = (await h.alice.get('/v1/payday-plan')).body as Plan;
    const body = {
      budgets: plan.lines.map((l) => ({
        categoryId: l.categoryId,
        amount: l.prefill,
      })),
      savings: { fromAccountId: everyday, toAccountId: rainy },
    };
    const before = (await h.alice.get('/v1/accounts/' + rainy)).body as {
      balance: Money;
    };
    const first = await h.alice.post('/v1/payday-plan/confirm', body);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const result = first.body as {
      savingsEntryId: string;
      budgets: { budgets: { name: string; planned: Money }[] };
    };
    expect(result.savingsEntryId).toBeTruthy();
    expect(
      result.budgets.budgets
        .map((b) => [b.name, b.planned.amountMinor] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    ).toEqual([
      ['Buffer', 0],
      ['Food', 45_000],
      ['Travel', 6_000],
    ]);
    const after = (await h.alice.get('/v1/accounts/' + rainy)).body as {
      balance: Money;
    };
    expect(after.balance.amountMinor).toBe(before.balance.amountMinor + 20_000);

    // A second tap moves nothing more and fails on nothing.
    const again = await h.alice.post('/v1/payday-plan/confirm', {
      budgets: [],
      savings: body.savings,
    });
    expect(again.status).toBe(200);
    expect((again.body as { savingsEntryId: string }).savingsEntryId).toBe(
      result.savingsEntryId,
    );
    const rainyNow = (await h.alice.get('/v1/accounts/' + rainy)).body as {
      balance: Money;
    };
    expect(rainyNow.balance).toEqual(after.balance);
  });

  it('changes an existing budget and prefills from it next time', async () => {
    const plan = (await h.alice.get('/v1/payday-plan')).body as Plan;
    const food = plan.lines.find((l) => l.categoryId === ids.Food);
    expect(food).toMatchObject({ current: usd(45_000), prefill: usd(45_000) });
    const changed = await h.alice.post('/v1/payday-plan/confirm', {
      budgets: [{ budgetId: food?.budgetId, amount: usd(50_000) }],
    });
    expect(changed.status).toBe(200);
    const next = (await h.alice.get('/v1/payday-plan')).body as Plan;
    expect(next.lines.find((l) => l.categoryId === ids.Food)?.current).toEqual(
      usd(50_000),
    );
  });

  it('checks everything before writing', async () => {
    const budgets = (await h.alice.get('/v1/budgets')).body as {
      budgets: { id: string; name: string; planned: Money }[];
    };
    const food = budgets.budgets.find((b) => b.name === 'Food');
    const bad = await h.alice.post('/v1/payday-plan/confirm', {
      budgets: [
        { budgetId: food?.id, amount: usd(77_000) },
        { budgetId: food?.id, amount: usd(0) },
      ],
    });
    expect(bad.status).toBe(400);
    const after = (await h.alice.get('/v1/budgets')).body as typeof budgets;
    expect(after.budgets.find((b) => b.name === 'Food')?.planned).toEqual(
      usd(50_000),
    );
    const missing = await h.alice.post('/v1/payday-plan/confirm', {
      budgets: [{ budgetId: 'x', categoryId: 'y', amount: usd(1) }],
    });
    expect(missing.status).toBe(400);
  });

  it('is private to each user', async () => {
    const bob = (await h.bob.get('/v1/payday-plan')).body as Plan;
    expect(bob.lines).toEqual([]);
    expect(bob.income).toEqual(usd(0));
  });
});

describe('insights', () => {
  it('measures the emergency fund against average expenses', async () => {
    const response = await h.alice.get('/v1/insights/emergency-fund');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      monthlyExpenses: usd(51_000),
      months: 3,
      target: usd(153_000),
      targetHigh: usd(306_000),
      // $800 plus the $200 moved to savings at payday.
      saved: usd(100_000),
      progressBasisPoints: 6_535,
    });
    await h.alice.patch('/v1/settings/ledger', { emergencyMonths: 6 });
    expect(
      (
        (await h.alice.get('/v1/insights/emergency-fund')).body as {
          target: Money;
        }
      ).target,
    ).toEqual(usd(306_000));
  });

  it('adds every account for net worth, with a daily series ending today', async () => {
    const response = await h.alice.get('/v1/insights/net-worth?days=10');
    expect(response.status).toBe(200);
    const body = response.body as {
      today: string;
      amount: Money;
      series: { date: string; amount: Money }[];
    };
    // $3,000 + $800 + $4,000 paychecks less $1,070 spent.
    expect(body.amount).toEqual(usd(300_000 + 80_000 + 400_000 - 107_000));
    expect(body.series).toHaveLength(10);
    expect(body.series.at(-1)).toEqual({
      date: '2026-04-02',
      amount: body.amount,
    });
    expect(body.series[0]?.date).toBe('2026-03-24');
    expect((await h.alice.get('/v1/insights/net-worth?days=0')).status).toBe(
      400,
    );
  });

  it('gives the weekly review figures', async () => {
    const response = await h.alice.get('/v1/insights/weekly-review');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      from: '2026-03-27',
      to: '2026-04-02',
      spent: usd(5_000),
      previousSpent: usd(0),
      entries: 1,
      overBudget: 0,
    });
    expect(
      (response.body as { topCategories: { categoryId: string }[] })
        .topCategories[0]?.categoryId,
    ).toBe(ids.Food);
  });

  it('needs a signed-in user', async () => {
    for (const path of [
      '/v1/payday-plan',
      '/v1/insights/emergency-fund',
      '/v1/insights/net-worth',
      '/v1/insights/weekly-review',
    ]) {
      const anonymous = await fetch(new URL(path, h.server.url));
      expect(anonymous.status).toBe(401);
    }
  });
});
