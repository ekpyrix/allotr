import { Link } from '@tanstack/react-router';
import {
  BookOpenText,
  CalendarCheck,
  Plus,
  Settings,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useQuickEntry } from '@/features/quick-entry/quick-entry-provider';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { navItems, type NavPath } from '@/nav-items';
import { Wordmark } from './wordmark.tsx';

const icons: Record<NavPath, LucideIcon> = {
  '/today': CalendarCheck,
  '/ledger': BookOpenText,
  '/accounts': WalletCards,
  '/settings': Settings,
};

const itemClass =
  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-2 text-xs text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:bg-plot aria-[current=page]:font-medium aria-[current=page]:text-foreground md:min-h-16 md:w-20 lg:w-52 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm';

// The bottom-bar Add button follows this destination.
const ADD_AFTER: NavPath = '/ledger';

// A button, not a route: it opens quick entry over the current view.
function AddButton({ className }: { className: string }) {
  const { open, shortcutsEnabled } = useQuickEntry();
  return (
    <button
      type="button"
      onClick={(event) => {
        open(event.currentTarget);
      }}
      aria-keyshortcuts={shortcutsEnabled ? 'n' : undefined}
      className={cn(itemClass, 'font-medium text-foreground', className)}
    >
      <Plus aria-hidden="true" className="size-5" />
      {t('quickEntry.add')}
    </button>
  );
}

// Bottom bar below md, side rail from md, wider rail with the wordmark
// from lg (FR-W3). The active item has a filled plot, not colour alone.
export function AppNav() {
  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:h-dvh md:border-t-0 md:border-r md:pb-0"
    >
      <Wordmark className="hidden px-6 pt-6 pb-8 lg:flex" />
      <div className="hidden md:block md:p-2 md:pb-0 lg:px-3">
        <AddButton className="w-full" />
      </div>
      <ul className="grid auto-cols-fr grid-flow-col md:flex md:flex-col md:gap-1 md:p-2 lg:px-3">
        {navItems.flatMap((item) => {
          const Icon = icons[item.to];
          const link = (
            <li key={item.to}>
              <Link
                to={item.to}
                activeProps={{ 'aria-current': 'page' }}
                className={itemClass}
              >
                <Icon aria-hidden="true" className="size-5" />
                {t(item.label)}
              </Link>
            </li>
          );
          // On phones the Add button sits in the middle of the bar, right
          // after the ledger, so it stays in thumb reach.
          return item.to === ADD_AFTER
            ? [
                link,
                <li key="add" className="md:hidden">
                  <AddButton className="w-full" />
                </li>,
              ]
            : [link];
        })}
      </ul>
    </nav>
  );
}
