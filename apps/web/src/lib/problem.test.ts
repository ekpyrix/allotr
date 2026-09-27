import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from './api.ts';
import { describeProblem, errorMessage } from './problem.ts';

function problem(status: number, extra: Record<string, unknown> = {}) {
  return new ApiError({
    type: 'about:blank',
    title: 'Title',
    status,
    ...extra,
  });
}

describe('describeProblem', () => {
  it('names the field for a single validation error', () => {
    const result = describeProblem(
      problem(400, { errors: [{ path: 'password', message: 'Too small' }] }),
    );
    expect(result).toEqual({
      message: 'Password: Too small',
      fields: { password: 'Too small' },
    });
  });

  it('summarises several validation errors and keys fields by last segment', () => {
    const result = describeProblem(
      problem(400, {
        errors: [
          { path: 'postings.0.amount', message: 'Required' },
          { path: '/postings/1/account', message: 'Unknown account' },
        ],
      }),
    );
    expect(result.message).toBe('2 fields need attention.');
    expect(result.fields).toEqual({
      amount: 'Required',
      account: 'Unknown account',
    });
  });

  it('prefers the catalog text for a known code', () => {
    expect(
      errorMessage(
        problem(403, { code: 'registration_closed', detail: 'Closed.' }),
      ),
    ).toBe('This instance is not accepting new accounts.');
  });

  it('uses the server detail for an unknown code', () => {
    expect(
      errorMessage(
        problem(409, { code: 'already_reversed', detail: 'Already undone.' }),
      ),
    ).toBe('Already undone.');
  });

  it('explains not-found and conflict without a detail', () => {
    expect(errorMessage(problem(404))).toBe(
      'This item no longer exists. Refresh and try again.',
    );
    expect(errorMessage(problem(409))).toBe(
      'This changed in the meantime. Refresh and try again.',
    );
  });

  it('explains rate limiting', () => {
    expect(errorMessage(problem(429))).toBe(
      'Too many attempts. Wait a minute and try again.',
    );
  });

  it('falls back to the status', () => {
    expect(errorMessage(problem(500))).toBe('The server answered 500 Title.');
  });

  it('tells the user to check the connection for network failures', () => {
    expect(errorMessage(new NetworkError(new TypeError('x')))).toMatch(
      /could not reach/,
    );
    expect(errorMessage(new TypeError('x'))).toMatch(/could not reach/);
  });
});
