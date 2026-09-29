import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  accountListSchema,
  bundleSchema,
  categoryListSchema,
  cycleListSchema,
  localDateSchema,
  moneySchema,
  tagListSchema,
  todaySchema,
  transactionListSchema,
  type BundleTransaction,
} from '@allotr/shared';
import { expect } from 'vitest';
import { z } from 'zod';
import type { TestClient, TestResponse } from './http-client.ts';

// Synthetic replay fixtures (testdata/synthetic/README.md): an import bundle
// plus timed API steps and checkpoints of hand-worked figures. Test-only;
// the format is not part of the public API.

export const syntheticDir = join(
  import.meta.dirname,
  '../../../../testdata/synthetic',
);

const instantSchema = z.iso.datetime();
const transactionSchema = bundleSchema.shape.transactions.unwrap().element;
const targetSchema = z.strictObject({
  occurredOn: localDateSchema,
  note: z.string().min(1),
});

const stepSchema = z.union([
  z.strictObject({ at: instantSchema, post: transactionSchema }),
  z.strictObject({ at: instantSchema, reverse: targetSchema }),
  z.strictObject({
    at: instantSchema,
    edit: z.strictObject({
      target: targetSchema,
      replacement: transactionSchema,
    }),
  }),
]);

const expectedTodaySchema = z.strictObject({
  today: localDateSchema.optional(),
  cycle: z
    .strictObject({ openedOn: localDateSchema, payday: localDateSchema })
    .optional(),
  cycleEnd: localDateSchema.optional(),
  overdue: z.boolean().optional(),
  daysLeft: z.int().optional(),
  available: moneySchema.optional(),
  startOfDay: moneySchema.optional(),
  spentToday: moneySchema.optional(),
  todayAllowance: moneySchema.optional(),
  leftToday: moneySchema.optional(),
  liveDaily: moneySchema.optional(),
  missingRates: z.array(z.string()).optional(),
});

// A cycle in GET /v1/cycles; the paycheck ids are not known to a fixture.
const expectedCycleSchema = z.strictObject({
  openedOn: localDateSchema,
  closedOn: localDateSchema.nullable().optional(),
  lastDay: localDateSchema.optional(),
  payday: localDateSchema.optional(),
  income: moneySchema.optional(),
  spending: moneySchema.optional(),
  leftover: moneySchema.optional(),
  savingsNetChange: moneySchema.optional(),
  amended: z.boolean().optional(),
  missingRates: z.array(z.string()).optional(),
});

const checkpointSchema = z.strictObject({
  at: instantSchema,
  /** Every unarchived account by name; balances are all-time. */
  balances: z.record(z.string(), moneySchema).optional(),
  today: expectedTodaySchema.optional(),
  /** Every cycle, newest first, as GET /v1/cycles lists them. */
  cycles: z.array(expectedCycleSchema).optional(),
});

const time = (at: string) => Date.parse(at);

export const replaySchema = z
  .strictObject({
    joinedOn: localDateSchema,
    steps: z.array(stepSchema).default([]),
    checkpoints: z.array(checkpointSchema).min(1),
  })
  .refine(
    (replay) => {
      const last = Math.max(...replay.checkpoints.map((c) => time(c.at)));
      return replay.steps.every((step) => time(step.at) <= last);
    },
    { error: 'A step after the last checkpoint would never be checked' },
  );

export type Replay = z.infer<typeof replaySchema>;
export type Step = Replay['steps'][number];
export type Checkpoint = Replay['checkpoints'][number];

export interface Fixture {
  readonly name: string;
  readonly bundle: unknown;
  readonly replay: Replay;
}

export function loadFixtures(dir: string = syntheticDir): Fixture[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const read = (file: string): unknown =>
        JSON.parse(readFileSync(join(dir, name, file), 'utf8')) as unknown;
      const bundle = read('bundle.json');
      bundleSchema.parse(bundle);
      return { name, bundle, replay: replaySchema.parse(read('replay.json')) };
    });
}

/**
 * The import instant, also pinned as the user's join time. Noon UTC keeps
 * the local day equal to `joinedOn` for offsets from −12 to +11.
 */
export function joinedAt(replay: Replay): string {
  return `${replay.joinedOn}T12:00:00.000Z`;
}

/** Each checkpoint, in time order, with the steps that run before it. */
export function checkpointsWithSteps(
  replay: Replay,
): { checkpoint: Checkpoint; steps: Step[] }[] {
  const steps = [...replay.steps].sort((a, b) => time(a.at) - time(b.at));
  const checkpoints = [...replay.checkpoints].sort(
    (a, b) => time(a.at) - time(b.at),
  );
  let next = 0;
  return checkpoints.map((checkpoint) => {
    const before: Step[] = [];
    for (;;) {
      const step = steps[next];
      if (step === undefined || time(step.at) > time(checkpoint.at)) break;
      before.push(step);
      next += 1;
    }
    return { checkpoint, steps: before };
  });
}

type Names = Readonly<{
  accounts: ReadonlyMap<string, string>;
  categories: ReadonlyMap<string, string>;
  tags: ReadonlyMap<string, string>;
}>;

const key = (name: string) => name.trim().toLowerCase();

async function loadNames(client: TestClient): Promise<Names> {
  const { accounts } = accountListSchema.parse(
    (await client.get('/v1/accounts')).body,
  );
  const { categories } = categoryListSchema.parse(
    (await client.get('/v1/categories')).body,
  );
  const { tags } = tagListSchema.parse((await client.get('/v1/tags')).body);
  const byId = new Map(categories.map((c) => [c.id, c]));
  return {
    accounts: new Map(accounts.map((a) => [key(a.name), a.id])),
    categories: new Map(
      categories.map((c) => {
        const parent = c.parentId === null ? undefined : byId.get(c.parentId);
        const path = parent === undefined ? c.name : `${parent.name}/${c.name}`;
        return [key(path), c.id];
      }),
    ),
    tags: new Map(tags.map((t) => [key(t.name), t.id])),
  };
}

function lookup(
  names: ReadonlyMap<string, string>,
  name: string,
  what: string,
): string {
  const id = names.get(key(name));
  if (id === undefined) {
    throw new Error(`A replay step names an unknown ${what} "${name}".`);
  }
  return id;
}

/** The API body for a bundle-shaped entry; tags must already exist. */
function toCreateBody(
  t: BundleTransaction,
  names: Names,
): Record<string, unknown> {
  const common = {
    occurredOn: t.occurredOn,
    ...(t.note === undefined ? {} : { note: t.note }),
    ...(t.tags === undefined
      ? {}
      : { tagIds: t.tags.map((tag) => lookup(names.tags, tag, 'tag')) }),
  };
  if (t.kind === 'write_off') {
    throw new Error('A replay step cannot post a write-off; archive instead.');
  }
  if (t.kind === 'transfer') {
    return {
      kind: 'transfer',
      fromAccountId: lookup(names.accounts, t.from, 'account'),
      toAccountId: lookup(names.accounts, t.to, 'account'),
      sent: t.sent,
      ...(t.received === undefined ? {} : { received: t.received }),
      ...(t.category === undefined
        ? {}
        : { categoryId: lookup(names.categories, t.category, 'category') }),
      ...common,
    };
  }
  return {
    kind: t.kind,
    accountId: lookup(names.accounts, t.account, 'account'),
    amount: t.amount,
    ...(t.lines === undefined
      ? { categoryId: lookup(names.categories, t.category ?? '', 'category') }
      : {
          lines: t.lines.map((line) => ({
            categoryId: lookup(names.categories, line.category, 'category'),
            amount: line.amount,
          })),
        }),
    ...(t.foreignAmount === undefined
      ? {}
      : { foreignAmount: t.foreignAmount }),
    ...common,
  };
}

/** The one live (not undone, not an undo) entry with this date and note. */
async function findTarget(
  client: TestClient,
  target: Readonly<{ occurredOn: string; note: string }>,
): Promise<string> {
  const query = new URLSearchParams({
    from: target.occurredOn,
    to: target.occurredOn,
    limit: '200',
  });
  const { transactions } = transactionListSchema.parse(
    (await client.get(`/v1/transactions?${query.toString()}`)).body,
  );
  const matches = transactions.filter(
    (t) =>
      t.note === target.note &&
      t.reversesId === null &&
      t.reversedById === null,
  );
  const [match] = matches;
  if (matches.length !== 1 || match === undefined) {
    throw new Error(
      `Expected one live entry on ${target.occurredOn} noted "${target.note}", found ${String(matches.length)}.`,
    );
  }
  return match.id;
}

export async function runStep(client: TestClient, step: Step): Promise<void> {
  const names = await loadNames(client);
  let response: TestResponse;
  if ('post' in step) {
    response = await client.post(
      '/v1/transactions',
      toCreateBody(step.post, names),
    );
  } else if ('reverse' in step) {
    const id = await findTarget(client, step.reverse);
    response = await client.post(`/v1/transactions/${id}/reverse`, {});
  } else {
    const id = await findTarget(client, step.edit.target);
    response = await client.post(
      `/v1/transactions/${id}/edit`,
      toCreateBody(step.edit.replacement, names),
    );
  }
  expect(
    response.status,
    `step at ${step.at}: ${JSON.stringify(response.body)}`,
  ).toBe(201);
}

export async function checkCheckpoint(
  client: TestClient,
  checkpoint: Checkpoint,
): Promise<void> {
  if (checkpoint.balances !== undefined) {
    const { accounts } = accountListSchema.parse(
      (await client.get('/v1/accounts')).body,
    );
    expect(
      Object.fromEntries(accounts.map((a) => [a.name, a.balance])),
      'balances',
    ).toEqual(checkpoint.balances);
  }
  if (checkpoint.today !== undefined) {
    const today = todaySchema.parse((await client.get('/v1/today')).body);
    // The opening paycheck's id is not known to a fixture.
    const actual: Record<string, unknown> = {
      ...today,
      cycle: { openedOn: today.cycle.openedOn, payday: today.cycle.payday },
    };
    const picked = Object.fromEntries(
      Object.keys(checkpoint.today).map((field) => [field, actual[field]]),
    );
    expect(picked, 'today').toEqual(checkpoint.today);
  }
  if (checkpoint.cycles !== undefined) {
    const { cycles } = cycleListSchema.parse(
      (await client.get('/v1/cycles')).body,
    );
    const picked = cycles.map((cycle, i) => {
      const expected = checkpoint.cycles?.[i] ?? { openedOn: '' };
      return Object.fromEntries(
        Object.keys(expected).map((field) => [
          field,
          (cycle as Record<string, unknown>)[field],
        ]),
      );
    });
    expect(picked, 'cycles').toEqual(checkpoint.cycles);
  }
}
