import { describe, expect, it } from 'vitest';
import { t } from './t.ts';

describe('t', () => {
  it('returns a plain message', () => {
    expect(t('en-US', 'reminders.weeklyReview.title')).toBe(
      'Your week is ready',
    );
  });

  it('fills placeholders', () => {
    expect(
      t('en-US', 'reminders.billDue.title', {
        name: 'Rent',
        date: '2026-03-16',
      }),
    ).toBe('Rent is due 2026-03-16');
  });

  it('picks the plural form from count', () => {
    const vars = { person: 'Sam Example' };
    expect(
      t('en', 'reminders.iouOverdue.owedToMe.title', { ...vars, count: 1 }),
    ).toBe('Sam Example is 1 day late');
    expect(
      t('en', 'reminders.iouOverdue.owedToMe.title', { ...vars, count: 5 }),
    ).toBe('Sam Example is 5 days late');
  });

  it('reads English for a language without a catalogue', () => {
    expect(t('xx-YY', 'reminders.weeklyReview.title')).toBe(
      'Your week is ready',
    );
    expect(t('constructor', 'reminders.weeklyReview.title')).toBe(
      'Your week is ready',
    );
  });
});
