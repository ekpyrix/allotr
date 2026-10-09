import { describe, expect, it } from 'vitest';
import { adjacentSubTab } from './use-shortcuts.ts';

describe('adjacentSubTab', () => {
  it('steps within a screen', () => {
    expect(adjacentSubTab('/budget/budgets', 1)).toBe('/budget/pools');
    expect(adjacentSubTab('/budget/pools', -1)).toBe('/budget/budgets');
  });

  it('clamps at both ends', () => {
    expect(adjacentSubTab('/budget/budgets', -1)).toBeNull();
    expect(adjacentSubTab('/budget/cover-order', 1)).toBeNull();
  });

  it('treats the bare accounts path as its first sub-tab', () => {
    expect(adjacentSubTab('/accounts', 1)).toBe('/accounts/on-budget');
    expect(adjacentSubTab('/accounts/credit', -1)).toBe('/accounts/off-budget');
    expect(adjacentSubTab('/accounts/on-budget', -1)).toBe('/accounts');
  });

  it('does nothing on screens without sub-tabs', () => {
    expect(adjacentSubTab('/', 1)).toBeNull();
    expect(adjacentSubTab('/transactions', 1)).toBeNull();
  });
});
