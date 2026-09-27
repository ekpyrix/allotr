import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkpointsWithSteps, loadFixtures, replaySchema } from './replay.ts';

const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });
const post = (at: string, note: string) => ({
  at,
  post: {
    kind: 'expense',
    account: 'Wallet',
    amount: eur(100),
    category: 'Fun',
    occurredOn: '2026-03-02',
    note,
  },
});

describe('replaySchema', () => {
  it('refuses a step after the last checkpoint', () => {
    const result = replaySchema.safeParse({
      joinedOn: '2026-03-01',
      steps: [post('2026-03-03T00:00:00Z', 'Late')],
      checkpoints: [{ at: '2026-03-02T00:00:00Z' }],
    });
    expect(result.success).toBe(false);
  });

  it('refuses unknown fields', () => {
    const result = replaySchema.safeParse({
      joinedOn: '2026-03-01',
      checkpoints: [{ at: '2026-03-02T00:00:00Z', balance: {} }],
    });
    expect(result.success).toBe(false);
  });
});

describe('checkpointsWithSteps', () => {
  it('runs each step before the first checkpoint at or after it', () => {
    const replay = replaySchema.parse({
      joinedOn: '2026-03-01',
      steps: [
        post('2026-03-05T00:00:00Z', 'Second'),
        post('2026-03-02T00:00:00Z', 'First'),
        post('2026-03-05T00:00:00Z', 'Third'),
      ],
      checkpoints: [
        { at: '2026-03-05T00:00:00Z' },
        { at: '2026-03-01T13:00:00Z' },
        { at: '2026-03-02T00:00:00Z' },
      ],
    });
    const notes = checkpointsWithSteps(replay).map(({ checkpoint, steps }) => [
      checkpoint.at,
      steps.map((s) => ('post' in s ? s.post.note : '')),
    ]);
    expect(notes).toEqual([
      ['2026-03-01T13:00:00Z', []],
      ['2026-03-02T00:00:00Z', ['First']],
      ['2026-03-05T00:00:00Z', ['Second', 'Third']],
    ]);
  });
});

describe('loadFixtures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'allotr-replay-'));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('fails loudly when a fixture misses a file', () => {
    mkdirSync(join(dir, 'broken'));
    writeFileSync(
      join(dir, 'broken', 'bundle.json'),
      JSON.stringify({ format: 'allotr.bundle', version: 1 }),
    );
    expect(() => loadFixtures(dir)).toThrow(/replay\.json/);
  });
});
