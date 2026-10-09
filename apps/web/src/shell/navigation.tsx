import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { navItems, settingsItem } from '../nav-items.ts';
import { screenIcons } from './icons.ts';

// Phone: a bottom tab bar. 600–999: a 72 px rail. From 1000: a 212 px
// sidebar. All three render from `navItems`, and `1`–`5` jump to the same
// entries (docs/ui.md §3, §5). The pieces sit in the shell grid's row tracks:
//   logo block  = summary bar row
//   nav rows    = title strip row height
//   settings row = command line row (same top edge)

const itemBase =
  'press flex min-w-0 items-center text-small aria-[current=page]:bg-primary aria-[current=page]:text-on-primary aria-[current=page]:hover:bg-primary';

// The tab bar and rail show the short label; the link is still named in
// full for assistive technology, as the sidebar shows it.
function NavLabel({ short, full }: { short: string; full: string }) {
  return (
    <>
      <span aria-hidden="true" className="max-w-full truncate wide:hidden">
        {short}
      </span>
      <span className="sr-only wide:not-sr-only wide:truncate">{full}</span>
    </>
  );
}

export function Navigation() {
  return (
    <>
      <div
        data-slot="logo"
        className="hidden items-center gap-2 border-r border-b bg-chrome px-3 medium:col-start-1 medium:row-start-1 medium:flex"
      >
        <Link
          to="/"
          aria-label={t('shell.logo')}
          className="flex min-h-hit min-w-hit items-center font-semibold text-primary"
        >
          <span aria-hidden="true">›</span>
          <span className="ml-1 hidden wide:inline">{t('app.name')}</span>
        </Link>
      </div>
      <nav
        aria-label={t('nav.label')}
        data-slot="nav"
        className={cn(
          'col-start-1 row-start-5 grid grid-cols-5 border-t bg-chrome',
          'medium:row-span-2 medium:row-start-2 medium:flex medium:flex-col medium:border-t-0 medium:border-r',
        )}
      >
        {navItems.map((item, index) => {
          const Icon = screenIcons[item.key];
          return (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === '/' }}
              className={cn(
                itemBase,
                'h-tab flex-col justify-center gap-0.5 text-tiny',
                'medium:h-strip medium:flex-col medium:gap-0',
                'wide:flex-row wide:justify-start wide:gap-2 wide:px-3 wide:text-small',
              )}
            >
              <Icon className="size-4 shrink-0" />
              <NavLabel short={t(item.short)} full={t(item.label)} />
              <kbd className="ml-auto hidden text-tiny opacity-100 wide:inline">
                {index + 1}
              </kbd>
            </Link>
          );
        })}
      </nav>
      <div
        data-slot="settings"
        className="hidden border-t border-r bg-chrome medium:col-start-1 medium:row-start-4 medium:flex"
      >
        <Link
          to={settingsItem.to}
          className={cn(
            itemBase,
            'h-full w-full flex-col justify-center text-tiny',
            'wide:flex-row wide:justify-start wide:gap-2 wide:px-3 wide:text-small',
          )}
        >
          {(() => {
            const Icon = screenIcons.settings;
            return <Icon className="size-4 shrink-0" />;
          })()}
          <NavLabel
            short={t(settingsItem.short)}
            full={t(settingsItem.label)}
          />
          <kbd className="ml-auto hidden text-tiny wide:inline">,</kbd>
        </Link>
      </div>
    </>
  );
}
