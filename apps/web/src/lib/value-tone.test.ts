import { describe, expect, it } from 'vitest';
import { toneClass, valueTone } from './value-tone.ts';

describe('valueTone', () => {
  it('colours by sign', () => {
    expect(valueTone(1)).toBe('positive');
    expect(valueTone(-1)).toBe('negative');
    expect(valueTone(0)).toBe('neutral');
  });

  it('colours a transfer blue whatever its sign', () => {
    expect(valueTone(500, 'transfer')).toBe('info');
    expect(valueTone(-500, 'transfer')).toBe('info');
    expect(valueTone(0, 'transfer')).toBe('info');
  });

  it('has a class for every tone', () => {
    for (const tone of ['positive', 'negative', 'info', 'neutral'] as const)
      expect(toneClass[tone]).toMatch(/^text-/);
  });
});
