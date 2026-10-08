import { describe, expect, it, vi } from 'vitest';
import { haptic, HAPTIC_PATTERNS } from './haptics.ts';

describe('haptic', () => {
  it.each(Object.keys(HAPTIC_PATTERNS) as (keyof typeof HAPTIC_PATTERNS)[])(
    'plays the %s pattern when enabled',
    (kind) => {
      const vibrate = vi.fn(() => true);
      haptic(kind, vibrate, true);
      expect(vibrate).toHaveBeenCalledWith([...HAPTIC_PATTERNS[kind]]);
    },
  );

  it('does nothing when the setting is off or there is no vibration', () => {
    const vibrate = vi.fn(() => true);
    haptic('save', vibrate, false);
    expect(vibrate).not.toHaveBeenCalled();
    expect(() => {
      haptic('save', undefined, true);
    }).not.toThrow();
  });

  it('survives a vibration that throws', () => {
    expect(() => {
      haptic(
        'tick',
        () => {
          throw new Error('blocked');
        },
        true,
      );
    }).not.toThrow();
  });
});
