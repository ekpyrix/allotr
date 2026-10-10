import { useParams } from '@tanstack/react-router';
import { BillsTab } from './bills-tab.tsx';
import { BudgetsTab } from './budgets-tab.tsx';
import { CoverOrderTab } from './cover-order-tab.tsx';
import { GoalsTab } from './goals-tab.tsx';
import { IousTab } from './ious-tab.tsx';
import { PoolsTab } from './pools-tab.tsx';

// Budget (docs/ui.md §6): one component per sub-tab, picked by the address.
export function BudgetScreen() {
  const { sub } = useParams({ strict: false });
  switch (sub) {
    case 'pools':
      return <PoolsTab />;
    case 'bills':
      return <BillsTab />;
    case 'goals':
      return <GoalsTab />;
    case 'ious':
      return <IousTab />;
    case 'cover-order':
      return <CoverOrderTab />;
    default:
      return <BudgetsTab />;
  }
}
