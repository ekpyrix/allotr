import { describe, expect, it } from 'vitest';
import { validateAccountsSearch } from './search-params.ts';

describe('validateAccountsSearch', () => {
  it('keeps an account id', () => {
    expect(validateAccountsSearch({ account: 'acc_1' })).toEqual({
      account: 'acc_1',
    });
  });

  it('drops anything that is not an id', () => {
    expect(validateAccountsSearch({ account: '' })).toEqual({});
    expect(validateAccountsSearch({ account: 7 })).toEqual({});
    expect(validateAccountsSearch({})).toEqual({});
  });
});
