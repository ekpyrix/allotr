import {
  darkTheme,
  lightTheme,
  SHIPPED_THEMES,
  THEME_PAIRS,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { checkDraft, draftFrom, pickerValue, TOKEN_GROUPS } from './draft.ts';

const paper = SHIPPED_THEMES.find((theme) => theme.id === 'paper');
if (paper === undefined) throw new Error('paper theme missing');

describe('checkDraft', () => {
  it('saves a named draft whose pairs all pass', () => {
    const check = checkDraft(draftFrom(paper, ' Sand '));
    expect(check.failures).toEqual([]);
    expect(check.pairs).toHaveLength(THEME_PAIRS.length);
    expect(check.body).toEqual({
      name: 'Sand',
      scheme: 'light',
      tokens: paper.tokens,
    });
  });

  it('needs a name', () => {
    const check = checkDraft(draftFrom(paper));
    expect(check.nameError).toBe(true);
    expect(check.body).toBeNull();
  });

  it('lists failing pairs and refuses to save', () => {
    const draft = draftFrom(paper, 'Faint');
    const check = checkDraft({
      ...draft,
      tokens: { ...draft.tokens, 'muted-foreground': '#c9bfa8' },
    });
    expect(check.body).toBeNull();
    expect(check.failures.map((f) => [f.foreground, f.background])).toEqual([
      ['muted-foreground', 'background'],
      ['muted-foreground', 'plot'],
      ['muted-foreground', 'muted'],
    ]);
  });

  it('skips contrast while a colour is not valid', () => {
    const draft = draftFrom(paper, 'Typing');
    const check = checkDraft({
      ...draft,
      tokens: { ...draft.tokens, ring: '#8a4' + '7' },
    });
    expect(check.badTokens).toEqual(['ring']);
    expect(check.pairs).toEqual([]);
    expect(check.body).toBeNull();
  });
});

describe('TOKEN_GROUPS', () => {
  it('lists every token once', () => {
    const listed = TOKEN_GROUPS.flatMap(([, tokens]) => tokens).sort();
    expect(listed).toEqual(Object.keys(lightTheme).sort());
  });
});

describe('pickerValue', () => {
  it.each([
    ['#ABC', '#aabbcc'],
    ['#0f1a17', '#0f1a17'],
    ['#12', '#000000'],
    ['red', '#000000'],
  ])('%s → %s', (value, expected) => {
    expect(pickerValue(value)).toBe(expected);
  });
});

describe('draftFrom', () => {
  it('copies scheme and colours', () => {
    const dark = SHIPPED_THEMES.find((theme) => theme.id === 'dark');
    expect(dark && draftFrom(dark)).toEqual({
      name: '',
      scheme: 'dark',
      tokens: darkTheme,
    });
  });
});
