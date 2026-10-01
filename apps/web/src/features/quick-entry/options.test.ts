import { money, type AccountView, type CategoryView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { readLastUsed, rememberChoice } from './last-used.ts';
import {
  categoryOptions,
  newDraft,
  paycheckDraft,
  switchKind,
  withToday,
  type DraftDefaults,
} from './options.ts';

function account(
  id: string,
  budgetGroup: 'on' | 'off',
  archived = false,
): AccountView {
  return {
    id,
    name: id,
    kind: 'asset',
    currency: 'USD',
    budgetGroup,
    balance: money(0, 'USD'),
    archived,
    createdAt: '2026-01-01T00:00:00.000Z',
    poolId: 'pool-budget',
    lastReconciledOn: null,
  } as AccountView;
}

function category(
  id: string,
  kind: CategoryView['kind'],
  parentId: string | null,
  position: number,
  mergedIntoId: string | null = null,
): CategoryView {
  return {
    id,
    name: id,
    kind,
    parentId,
    isPaycheck: false,
    position,
    colour: null,
    icon: null,
    mergedIntoId,
  };
}

const categories = [
  category('Transport', 'expense', null, 2),
  category('Food', 'expense', null, 1),
  category('Eating out', 'expense', 'Food', 2),
  category('Groceries', 'expense', 'Food', 1),
  category('Old', 'expense', null, 3, 'Food'),
  category('Salary', 'income', null, 1),
];

const defaults = (patch: Partial<DraftDefaults> = {}): DraftDefaults => ({
  accounts: [
    account('Savings', 'off'),
    account('Everyday', 'on'),
    account('Card', 'on'),
  ],
  categories,
  today: '2026-03-14',
  lastUsed: {},
  ...patch,
});

describe('categoryOptions', () => {
  it('lists a kind in position order, children under parents, merged left out', () => {
    expect(categoryOptions(categories, 'expense')).toEqual([
      { id: 'Food', label: 'Food' },
      { id: 'Groceries', label: 'Food / Groceries' },
      { id: 'Eating out', label: 'Food / Eating out' },
      { id: 'Transport', label: 'Transport' },
    ]);
    expect(categoryOptions(categories, 'transfer')).toEqual([]);
  });
});

describe('newDraft', () => {
  it('starts an expense today from the first on-budget account, no category', () => {
    expect(newDraft(defaults())).toEqual({
      kind: 'expense',
      amount: '',
      accountId: 'Everyday',
      toAccountId: '',
      received: '',
      foreign: '',
      foreignCurrency: '',
      lines: [],
      categoryId: '',
      tagIds: [],
      note: '',
      occurredOn: '2026-03-14',
    });
  });

  it('uses remembered choices that still exist', () => {
    const lastUsed = {
      expense: { accountId: 'Card', categoryId: 'Groceries' },
    };
    expect(newDraft(defaults({ lastUsed }))).toMatchObject({
      accountId: 'Card',
      categoryId: 'Groceries',
    });
  });

  it('falls back when a remembered account or category is gone', () => {
    const lastUsed = { expense: { accountId: 'Archived', categoryId: 'Old' } };
    expect(newDraft(defaults({ lastUsed }))).toMatchObject({
      accountId: 'Everyday',
      categoryId: '',
    });
  });

  it('uses the first account when none is on budget', () => {
    expect(
      newDraft(defaults({ accounts: [account('Savings', 'off')] })).accountId,
    ).toBe('Savings');
  });
});

describe('archived accounts', () => {
  const withArchived = (patch: Partial<DraftDefaults> = {}) =>
    defaults({
      accounts: [
        account('Closed', 'on', true),
        account('Everyday', 'on'),
        account('Savings', 'off'),
      ],
      ...patch,
    });

  it('skips an archived on-budget account when starting a draft', () => {
    expect(newDraft(withArchived()).accountId).toBe('Everyday');
  });

  it('falls back when the remembered account is archived', () => {
    const lastUsed = { expense: { accountId: 'Closed' } };
    expect(newDraft(withArchived({ lastUsed })).accountId).toBe('Everyday');
  });

  it('never offers an archived account as a transfer source or target', () => {
    const lastUsed = {
      transfer: { accountId: 'Closed', toAccountId: 'Closed' },
    };
    expect(
      switchKind(
        newDraft(withArchived()),
        'transfer',
        withArchived({ lastUsed }),
      ),
    ).toMatchObject({ accountId: 'Everyday', toAccountId: 'Savings' });
  });

  it('uses the first open account when every on-budget one is archived', () => {
    const accounts = [account('Closed', 'on', true), account('Savings', 'off')];
    expect(newDraft(defaults({ accounts })).accountId).toBe('Savings');
  });
});

describe('switchKind', () => {
  const pay = { ...category('Pay', 'income', null, 2), isPaycheck: true };

  it('starts income in the paycheck category when none was used before', () => {
    const withPay = defaults({ categories: [...categories, pay] });
    expect(switchKind(newDraft(withPay), 'income', withPay).categoryId).toBe(
      'Pay',
    );
  });

  it('prefers the income category used last over the paycheck category', () => {
    const withPay = defaults({
      categories: [...categories, pay],
      lastUsed: { income: { accountId: 'Everyday', categoryId: 'Salary' } },
    });
    expect(switchKind(newDraft(withPay), 'income', withPay).categoryId).toBe(
      'Salary',
    );
  });

  it('leaves income without a category when there is no paycheck category', () => {
    expect(
      switchKind(newDraft(defaults()), 'income', defaults()).categoryId,
    ).toBe('');
  });

  it('keeps what was typed and picks a different target for a transfer', () => {
    const typed = {
      ...newDraft(defaults()),
      amount: '9',
      note: 'x',
      tagIds: ['t'],
    };
    expect(switchKind(typed, 'transfer', defaults())).toMatchObject({
      kind: 'transfer',
      amount: '9',
      note: 'x',
      tagIds: ['t'],
      accountId: 'Everyday',
      toAccountId: 'Savings',
      categoryId: '',
    });
  });

  it('leaves the target empty when only one account is open', () => {
    const accounts = [
      account('Everyday', 'on'),
      account('Closed', 'off', true),
    ];
    expect(
      switchKind(
        newDraft(defaults({ accounts })),
        'transfer',
        defaults({ accounts }),
      ),
    ).toMatchObject({ accountId: 'Everyday', toAccountId: '' });
  });

  it('clears the received amount when the kind changes', () => {
    const typed = {
      ...newDraft(defaults()),
      kind: 'transfer' as const,
      received: '12',
    };
    expect(switchKind(typed, 'expense', defaults()).received).toBe('');
  });

  it('never picks the source as the remembered target', () => {
    const lastUsed = { transfer: { accountId: 'Card', toAccountId: 'Card' } };
    expect(
      switchKind(newDraft(defaults()), 'transfer', defaults({ lastUsed })),
    ).toMatchObject({ accountId: 'Card', toAccountId: 'Savings' });
  });
});

describe('last used', () => {
  function memoryStorage() {
    const items = new Map<string, string>();
    return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    };
  }

  it('remembers the account and category per kind', () => {
    const storage = memoryStorage();
    const draft = { ...newDraft(defaults()), categoryId: 'Food' };
    rememberChoice(storage, draft);
    rememberChoice(storage, {
      ...draft,
      kind: 'transfer',
      toAccountId: 'Savings',
    });
    expect(readLastUsed(storage)).toEqual({
      expense: { accountId: 'Everyday', categoryId: 'Food' },
      transfer: {
        accountId: 'Everyday',
        categoryId: 'Food',
        toAccountId: 'Savings',
      },
    });
  });

  it('reads garbage, missing or blocked storage as nothing remembered', () => {
    const storage = memoryStorage();
    storage.setItem('allotr.quick-entry.last', '{not json');
    expect(readLastUsed(storage)).toEqual({});
    expect(readLastUsed(undefined)).toEqual({});
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readLastUsed(blocked)).toEqual({});
    expect(() => {
      rememberChoice(blocked, newDraft(defaults()));
    }).not.toThrow();
  });
});

describe('withToday', () => {
  const draft = newDraft(defaults());

  it('follows the latest today until the date was edited', () => {
    expect(withToday(draft, '2026-03-15', false).occurredOn).toBe('2026-03-15');
  });

  it('keeps an edited date, even an emptied one', () => {
    const edited = { ...draft, occurredOn: '2026-03-01' };
    expect(withToday(edited, '2026-03-15', true)).toBe(edited);
    const emptied = { ...draft, occurredOn: '' };
    expect(withToday(emptied, '2026-03-15', true).occurredOn).toBe('');
  });

  it('returns the same draft when nothing changes', () => {
    expect(withToday(draft, '2026-03-14', false)).toBe(draft);
  });
});

describe('paycheckDraft', () => {
  const defaults = (list: CategoryView[]): DraftDefaults => ({
    accounts: [account('Savings', 'off'), account('Everyday', 'on')],
    categories: list,
    today: '2026-03-15',
    lastUsed: {},
  });

  it('is an income entry in the paycheck category, from an on-budget account', () => {
    const pay = { ...category('Pay', 'income', null, 1), isPaycheck: true };
    const draft = paycheckDraft(
      defaults([category('Gift', 'income', null, 0), pay]),
    );
    expect(draft).toMatchObject({
      kind: 'income',
      categoryId: 'Pay',
      accountId: 'Everyday',
      occurredOn: '2026-03-15',
      amount: '',
    });
  });

  it('skips a merged paycheck category and falls back to plain income', () => {
    const merged = {
      ...category('Old', 'income', null, 1, 'Pay'),
      isPaycheck: true,
    };
    expect(paycheckDraft(defaults([merged]))).toMatchObject({
      kind: 'income',
      categoryId: '',
    });
  });
});
