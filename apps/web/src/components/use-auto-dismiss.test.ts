import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleDismiss } from './use-auto-dismiss.ts';

describe('scheduleDismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once after the delay', () => {
    const fn = vi.fn();
    scheduleDismiss(5000, fn);
    vi.advanceTimersByTime(4999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not fire once cancelled', () => {
    const fn = vi.fn();
    scheduleDismiss(5000, fn)();
    vi.advanceTimersByTime(6000);
    expect(fn).not.toHaveBeenCalled();
  });
});
