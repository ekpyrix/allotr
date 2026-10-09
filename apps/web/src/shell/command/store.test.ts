import { money } from '@allotr/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeNewForm,
  dismissLogged,
  focusCommandLine,
  getCommandState,
  NEW_FORM_KINDS,
  openNewForm,
  registerCommandInput,
  resetCommandState,
  setIntoAccount,
  showLogged,
  subscribeCommandState,
} from './store.ts';

beforeEach(resetCommandState);

describe('focusCommandLine', () => {
  it('reports false when no input is mounted', () => {
    expect(focusCommandLine()).toBe(false);
  });

  it('focuses the registered input, until it unmounts', () => {
    const element = { focus: vi.fn() };
    registerCommandInput(element);
    expect(focusCommandLine()).toBe(true);
    expect(element.focus).toHaveBeenCalledOnce();
    registerCommandInput(null);
    expect(focusCommandLine()).toBe(false);
  });
});

describe('command state', () => {
  it('keeps the account, result and open form, and tells subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCommandState(listener);
    setIntoAccount('acc_1');
    showLogged({
      id: 'tx_1',
      amount: money(-1250, 'USD'),
      kind: 'expense',
      accountName: 'Daily card',
      categoryLabel: 'Food',
    });
    openNewForm('iou');
    expect(getCommandState()).toMatchObject({
      intoAccountId: 'acc_1',
      newForm: 'iou',
      logged: { id: 'tx_1' },
    });
    expect(listener).toHaveBeenCalledTimes(3);
    dismissLogged();
    closeNewForm();
    expect(getCommandState().logged).toBeNull();
    expect(getCommandState().newForm).toBeNull();
    unsubscribe();
    setIntoAccount(null);
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it('does not notify when dismissing nothing', () => {
    const listener = vi.fn();
    subscribeCommandState(listener);
    dismissLogged();
    closeNewForm();
    expect(listener).not.toHaveBeenCalled();
  });

  it('offers the seven + new items in order', () => {
    expect(NEW_FORM_KINDS).toEqual([
      'expense',
      'income',
      'transfer',
      'split',
      'payday',
      'bill',
      'iou',
    ]);
  });
});
