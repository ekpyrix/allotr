import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runReminders } from './reminders.ts';
import type { PushSender } from './push/delivery.ts';
import { startWithTwoUsers, type TwoUsers } from './testing/users.ts';

// Reminders and opt-in Web Push through the API against real SQLite and
// migrations: the scheduler's job records each reminder once, pushes only to
// users who subscribed, drops a subscription the push service no longer
// knows, and keeps users apart. The clock is fixed; everything is made up.

type Money = { amountMinor: number; currency: string };
const usd = (amountMinor: number): Money => ({ amountMinor, currency: 'USD' });

let clock = new Date('2026-03-15T12:00:00Z');
const sent: { endpoint: string; payload: string }[] = [];
let outcome: 'sent' | 'gone' = 'sent';
const send: PushSender = (subscription, payload) => {
  sent.push({ endpoint: subscription.endpoint, payload });
  return Promise.resolve(outcome);
};
let h: TwoUsers;

type Feed = {
  reminders: {
    id: string;
    kind: string;
    title: string;
    body: string;
    url: string;
    readAt: string | null;
  }[];
  unread: number;
};
const feed = async (who: TwoUsers['alice']) =>
  (await who.get('/v1/reminders')).body as Feed;

beforeAll(async () => {
  h = await startWithTwoUsers({ now: () => clock, sendPush: send });
  await h.db
    .updateTable('users')
    .set({ created_at: clock.toISOString() })
    .execute();
  const account = (
    (
      await h.alice.post('/v1/accounts', {
        name: 'Everyday',
        currency: 'USD',
        openingBalance: usd(500000),
      })
    ).body as { id: string }
  ).id;
  const categories = (
    (await h.alice.get('/v1/categories')).body as {
      categories: { id: string; name: string }[];
    }
  ).categories;
  const housing = categories.find((c) => c.name === 'Housing')?.id ?? '';
  await h.alice.post('/v1/bills', {
    name: 'Rent',
    amount: usd(80000),
    dueDay: 16,
    accountId: account,
    categoryId: housing,
  });
  await h.alice.post('/v1/ious', {
    direction: 'owed-to-me',
    accountId: account,
    people: [
      { person: 'Alex Example', amount: usd(2000), dueOn: '2026-03-10' },
    ],
    occurredOn: '2026-03-01',
  });
});

afterAll(async () => {
  await h.close();
});

describe('reminders job', () => {
  it('records each reminder once, however often it runs', async () => {
    const first = await runReminders(h.db, send, clock);
    expect(first.created).toBeGreaterThanOrEqual(3);
    const kinds = (await feed(h.alice)).reminders.map((r) => r.kind).sort();
    expect(kinds).toEqual(['bill_due', 'iou_overdue', 'weekly_review']);
    const again = await runReminders(h.db, send, clock);
    expect(again.created).toBe(0);
    expect((await feed(h.alice)).reminders).toHaveLength(3);
  });

  it('words them with the made-up names and amounts', async () => {
    const { reminders } = await feed(h.alice);
    const bill = reminders.find((r) => r.kind === 'bill_due');
    expect(bill).toMatchObject({
      title: 'Rent is due 2026-03-16',
      url: '/budget#bills',
    });
    expect(bill?.body).toContain('$800.00');
    expect(reminders.find((r) => r.kind === 'iou_overdue')?.title).toBe(
      'Alex Example is 5 days late',
    );
  });

  it('keeps users apart', async () => {
    expect((await feed(h.bob)).reminders.map((r) => r.kind)).toEqual([
      'weekly_review',
    ]);
  });

  it('sends nothing to a user who did not opt in', () => {
    expect(sent).toEqual([]);
  });

  it("adds the next week's reminders, and an overdue IOU again a week on", async () => {
    clock = new Date('2026-03-23T12:00:00Z');
    const run = await runReminders(h.db, send, clock);
    expect(run.created).toBeGreaterThan(0);
    const kinds = (await feed(h.alice)).reminders.map((r) => r.kind);
    expect(kinds.filter((k) => k === 'iou_overdue')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'weekly_review')).toHaveLength(2);
  });
});

describe('read state', () => {
  it('marks some, then all, read', async () => {
    const before = await feed(h.alice);
    const [one] = before.reminders;
    expect(
      (await h.alice.post('/v1/reminders/read', { ids: [one?.id] })).status,
    ).toBe(204);
    expect((await feed(h.alice)).unread).toBe(before.unread - 1);
    expect((await h.alice.post('/v1/reminders/read', {})).status).toBe(204);
    expect((await feed(h.alice)).unread).toBe(0);
    expect((await feed(h.bob)).unread).toBe(2);
  });
});

describe('push subscriptions', () => {
  const subscription = {
    endpoint: 'https://push.example.test/send/alex',
    keys: {
      p256dh:
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      auth: 'AAAAAAAAAAAAAAAAAAAAAA',
    },
  };

  it('serves the public key, generated once', async () => {
    const first = (await h.alice.get('/v1/push/config')).body as {
      publicKey: string;
    };
    const second = (await h.bob.get('/v1/push/config')).body as {
      publicKey: string;
    };
    expect(first.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/u);
    expect(second).toEqual(first);
    const row = await h.db
      .selectFrom('instance_settings')
      .select('value')
      .where('key', '=', 'vapid_keys')
      .executeTakeFirstOrThrow();
    expect(JSON.parse(row.value)).toMatchObject({ publicKey: first.publicKey });
  });

  it('is off until a device subscribes, then pushes new reminders to it', async () => {
    expect(
      (
        (await h.alice.get('/v1/push/subscriptions')).body as {
          subscriptions: unknown[];
        }
      ).subscriptions,
    ).toEqual([]);
    expect(
      (await h.alice.post('/v1/push/subscriptions', subscription)).status,
    ).toBe(204);
    const list = (await h.alice.get('/v1/push/subscriptions')).body as {
      subscriptions: { endpoint: string }[];
    };
    expect(list.subscriptions.map((s) => s.endpoint)).toEqual([
      subscription.endpoint,
    ]);
    clock = new Date('2026-03-30T12:00:00Z');
    await runReminders(h.db, send, clock);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((s) => s.endpoint === subscription.endpoint)).toBe(true);
    expect(JSON.parse(sent[0]?.payload ?? '{}')).toHaveProperty('title');
  });

  it('refuses a subscription that is not https', async () => {
    const response = await h.alice.post('/v1/push/subscriptions', {
      ...subscription,
      endpoint: 'http://push.example.test/send/alex',
    });
    expect(response.status).toBe(400);
  });

  it('sends a test and drops a subscription the push service no longer knows', async () => {
    const ok = (await h.alice.post('/v1/push/test', {})).body as {
      sent: number;
    };
    expect(ok.sent).toBe(1);
    outcome = 'gone';
    const gone = (await h.alice.post('/v1/push/test', {})).body as {
      removed: number;
    };
    expect(gone.removed).toBe(1);
    expect(
      (
        (await h.alice.get('/v1/push/subscriptions')).body as {
          subscriptions: unknown[];
        }
      ).subscriptions,
    ).toEqual([]);
  });

  it('turns a device off, only for its own user', async () => {
    outcome = 'sent';
    await h.alice.post('/v1/push/subscriptions', subscription);
    await h.bob.delete(
      `/v1/push/subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`,
    );
    expect(
      (
        (await h.alice.get('/v1/push/subscriptions')).body as {
          subscriptions: unknown[];
        }
      ).subscriptions,
    ).toHaveLength(1);
    expect(
      (
        await h.alice.delete(
          `/v1/push/subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`,
        )
      ).status,
    ).toBe(204);
    expect(
      (
        (await h.alice.get('/v1/push/subscriptions')).body as {
          subscriptions: unknown[];
        }
      ).subscriptions,
    ).toEqual([]);
  });
});
