import { useParams } from '@tanstack/react-router';
import { AccountTab } from './account-tab.tsx';
import { AppTab } from './app-tab.tsx';
import { CategoriesTab } from './categories-tab.tsx';
import { DataTab } from './data-tab.tsx';
import { PoliciesTab } from './policies-tab.tsx';
import { MoneyTab } from './money-tab.tsx';

// Settings (docs/ui.md §6): one component per sub-tab, picked by the address.
export function SettingsScreen() {
  const { sub } = useParams({ strict: false });
  switch (sub) {
    case 'categories':
      return <CategoriesTab />;
    case 'policies':
      return <PoliciesTab />;
    case 'app':
      return <AppTab />;
    case 'account':
      return <AccountTab />;
    case 'data':
      return <DataTab />;
    default:
      return <MoneyTab />;
  }
}
