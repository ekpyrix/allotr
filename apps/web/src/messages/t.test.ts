import { describe, expect, it } from 'vitest';
import { errorCodeMessage, t } from './t.ts';

describe('t', () => {
  it('returns a plain message', () => {
    expect(t('nav.today')).toBe('Today');
  });

  it('fills placeholders', () => {
    expect(t('today.greeting', { name: 'Sam Example' })).toMatch(
      /^Hello Sam Example\./,
    );
  });

  it('picks the plural form from count', () => {
    expect(t('errors.validationSummary', { count: 1 })).toBe(
      '1 field needs attention.',
    );
    expect(t('errors.validationSummary', { count: 3 })).toBe(
      '3 fields need attention.',
    );
  });
});

describe('errorCodeMessage', () => {
  it('knows catalogued codes and nothing else', () => {
    expect(errorCodeMessage('registration_closed')).toBeDefined();
    expect(errorCodeMessage('no_such_code')).toBeUndefined();
    expect(errorCodeMessage('toString')).toBeUndefined();
  });
});
