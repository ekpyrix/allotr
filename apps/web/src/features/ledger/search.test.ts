import { describe, expect, it } from 'vitest';
import { filterOf, isFiltered, validateLedgerSearch } from './search.ts';

describe('validateLedgerSearch', () => {
  it('keeps well-formed filters and drops the rest', () => {
    expect(
      validateLedgerSearch({
        account: 'a-1',
        category: '',
        tag: 42,
        from: '2026-03-01',
        to: '2026-02-30',
        q: '  coffee ',
        entry: 'e-1',
        other: 'x',
      }),
    ).toEqual({
      account: 'a-1',
      category: undefined,
      tag: undefined,
      from: '2026-03-01',
      to: undefined,
      q: 'coffee',
      entry: 'e-1',
    });
  });

  it('treats a blank search as none', () => {
    expect(validateLedgerSearch({ q: '   ' }).q).toBeUndefined();
  });
});

describe('filterOf', () => {
  it('maps the URL to the API filter, leaving out the open entry', () => {
    const search = validateLedgerSearch({ tag: 't-1', entry: 'e-1' });
    expect(filterOf(search)).toEqual({
      accountId: undefined,
      categoryId: undefined,
      tagId: 't-1',
      from: undefined,
      to: undefined,
      q: undefined,
      undone: 'hide',
    });
    expect(filterOf(validateLedgerSearch({ deleted: 'show' })).undone).toBe(
      'show',
    );
    expect(validateLedgerSearch({ deleted: 'yes' }).deleted).toBeUndefined();
    expect(isFiltered(search)).toBe(true);
    expect(isFiltered(validateLedgerSearch({ entry: 'e-1' }))).toBe(false);
  });
});
