import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCountdown, snackDuration } from './snackbar-timer.ts';

describe('snackDuration', () => {
  it('gives 5 s, or 8 s with an action', () => {
    expect(snackDuration(false)).toBe(5000);
    expect(snackDuration(true)).toBe(8000);
  });
});

describe('createCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends after its time', () => {
    const done = vi.fn();
    createCountdown(5000, done);
    vi.advanceTimersByTime(4999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledOnce();
  });

  it('keeps the time left while paused', () => {
    const done = vi.fn();
    const countdown = createCountdown(5000, done);
    vi.advanceTimersByTime(3000);
    countdown.pause();
    vi.advanceTimersByTime(60_000);
    expect(done).not.toHaveBeenCalled();
    countdown.resume();
    vi.advanceTimersByTime(1999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledOnce();
  });

  it('ignores repeated pauses and resumes, and can be cancelled', () => {
    const done = vi.fn();
    const countdown = createCountdown(1000, done);
    countdown.pause();
    countdown.pause();
    countdown.resume();
    countdown.resume();
    countdown.cancel();
    vi.advanceTimersByTime(5000);
    expect(done).not.toHaveBeenCalled();
  });
});
