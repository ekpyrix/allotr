import { money, type PaydayPlanView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { initialTexts, lineKey, toConfirmBody } from './lines.ts';

const usd = (n: number) => money(n, 'USD');
type Line = PaydayPlanView['lines'][number];
const line = (extra: Partial<Line>): Line => ({
  budgetId: null,
  categoryId: null,
  tagId: null,
  current: usd(0),
  suggested: usd(0),
  prefill: usd(0),
  ...extra,
});

const lines = [
  line({ budgetId: 'b1', prefill: usd(90_000) }),
  line({ categoryId: 'c1', suggested: usd(20_000), prefill: usd(20_000) }),
  line({ categoryId: 'c2' }),
];

describe('payday sheet lines', () => {
  it('starts each field from the prefill, empty for none', () => {
    const texts = initialTexts(lines, 'en-US');
    expect(texts.b1).toBe('900.00');
    expect(texts.c1).toBe('200.00');
    expect(texts.c2).toBe('');
    expect(lineKey(lines[2] as Line)).toBe('c2');
  });

  it('plans new categories only when they have an amount', () => {
    const result = toConfirmBody(
      lines,
      { b1: '850', c1: '200', c2: '' },
      'USD',
      'en-US',
      undefined,
    );
    expect(result).toEqual({
      ok: true,
      body: {
        budgets: [
          { budgetId: 'b1', amount: usd(85_000) },
          { categoryId: 'c1', amount: usd(20_000) },
        ],
      },
    });
  });

  it('keeps an existing budget at zero and reports bad text', () => {
    expect(
      toConfirmBody(
        lines,
        { b1: '0', c1: '', c2: '' },
        'USD',
        'en-US',
        undefined,
      ),
    ).toEqual({
      ok: true,
      body: { budgets: [{ budgetId: 'b1', amount: usd(0) }] },
    });
    expect(
      toConfirmBody(
        lines,
        { b1: 'lots', c1: '', c2: '' },
        'USD',
        'en-US',
        undefined,
      ),
    ).toEqual({ ok: false, invalid: ['b1'] });
  });

  it('passes the savings transfer through', () => {
    const savings = { fromAccountId: 'a', toAccountId: 'b' };
    const result = toConfirmBody([], {}, 'USD', 'en-US', savings);
    expect(result).toEqual({ ok: true, body: { budgets: [], savings } });
  });
});
