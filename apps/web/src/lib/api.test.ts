import { describe, expect, it } from 'vitest';
import { ApiError, errorMessage } from './api.ts';

describe('errorMessage', () => {
  it('names the first invalid field', () => {
    const error = new ApiError({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      errors: [{ path: 'password', message: 'Too small' }],
    });
    expect(errorMessage(error)).toBe('Password: Too small');
  });

  it('uses the problem detail when there is one', () => {
    const error = new ApiError({
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      detail: 'Invalid email or password',
    });
    expect(errorMessage(error)).toBe('Invalid email or password');
  });

  it('explains rate limiting without a detail', () => {
    const error = new ApiError({
      type: 'about:blank',
      title: 'Too Many Requests',
      status: 429,
    });
    expect(errorMessage(error)).toBe(
      'Too many attempts. Wait a minute and try again.',
    );
  });

  it('tells the user to check the connection for network failures', () => {
    expect(errorMessage(new TypeError('fetch failed'))).toMatch(
      /could not reach/,
    );
  });
});
