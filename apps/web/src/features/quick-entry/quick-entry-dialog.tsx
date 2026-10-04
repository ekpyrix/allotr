import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useRef, useState } from 'react';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import {
  accountsQuery,
  categoriesQuery,
  ledgerSettingsQuery,
  tagsQuery,
  todayQuery,
} from '@/lib/ledger';
import { useOnline } from '@/lib/online';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';
import { QuickEntryForm } from './quick-entry-form.tsx';

/** How the form starts: as a paycheck, for the first cycle. */
export type QuickEntryPreset = 'paycheck';

// The sheet has no bottom padding so the form's Save bar can sit flush
// with its edge; the bar, or these states, keep clear of the home
// indicator.
const sheetEnd = 'pb-[max(1.5rem,env(safe-area-inset-bottom))]';

function QuickEntryLoader({
  onSaved,
  onClose,
  onNavigate,
  onSavingChange,
  preset,
}: {
  onSaved: (message: string, entryId: string) => void;
  onClose: () => void;
  onNavigate: () => void;
  onSavingChange: (saving: boolean) => void;
  preset: QuickEntryPreset | undefined;
}) {
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const tags = useQuery(tagsQuery);
  const settings = useQuery(ledgerSettingsQuery);
  const today = useQuery(todayQuery);
  const all = [accounts, categories, tags, settings, today];
  const online = useOnline();

  // A failed background refetch keeps the form (and what was typed) as long
  // as there is data to show.
  const failing = (query: (typeof all)[number]) =>
    query.isError && query.data === undefined;
  const failed = all.find(failing);
  if (failed !== undefined)
    return (
      <div className={`mt-6 grid gap-4 ${sheetEnd}`}>
        <FormError message={errorMessage(failed.error)} />
        <Button
          onClick={() => {
            for (const query of all) if (failing(query)) void query.refetch();
          }}
        >
          {t('errors.retry')}
        </Button>
      </div>
    );
  if (
    accounts.data === undefined ||
    categories.data === undefined ||
    tags.data === undefined ||
    settings.data === undefined ||
    today.data === undefined
  )
    return (
      <p role="status" className={`mt-6 text-body text-text-muted ${sheetEnd}`}>
        {/* Offline the queries wait for the connection instead of failing. */}
        {online ? t('quickEntry.loading') : t('quickEntry.offline')}
      </p>
    );
  // Archived accounts stay in the ledger but cannot take new entries.
  const open = accounts.data.accounts.filter((a) => !a.archived);
  if (open.length === 0)
    return (
      <div className={`mt-6 grid gap-4 ${sheetEnd}`}>
        <p>{t('quickEntry.noAccounts')}</p>
        <Link
          to="/accounts"
          onClick={() => {
            onNavigate();
            onClose();
          }}
          className="font-medium underline underline-offset-4"
        >
          {t('quickEntry.goToAccounts')}
        </Link>
      </div>
    );
  return (
    <QuickEntryForm
      accounts={open}
      categories={categories.data.categories}
      tags={tags.data.tags}
      locale={settings.data.locale}
      today={today.data.today}
      entryTimes={settings.data.entryTimes}
      timeZone={settings.data.timeZone}
      onSaved={onSaved}
      onSavingChange={onSavingChange}
      preset={preset}
      stickyActions
    />
  );
}

// A bottom sheet that rises in on phones, a centred dialog from the
// expanded size class. Radix traps focus and
// closes on Escape; the provider gives focus back to whatever opened it. A
// pending save cannot be dismissed, so its result is never lost and a retry
// cannot duplicate the entry.
export function QuickEntryDialog({
  open,
  onOpenChange,
  onSaved,
  onNavigate,
  onCloseAutoFocus,
  preset,
}: {
  preset?: QuickEntryPreset | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string, entryId: string) => void;
  /** The dialog closes because a link in it is taking the user elsewhere. */
  onNavigate: () => void;
  onCloseAutoFocus: () => void;
}) {
  const content = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/40 data-[state=open]:scrim-in dark:bg-black/60" />
        <Dialog.Content
          ref={content}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onCloseAutoFocus();
          }}
          // The amount field focuses itself once the data is there; until
          // then focus the dialog, never the Close button.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (!content.current?.contains(document.activeElement))
              content.current?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-40 max-h-[92dvh] overflow-y-auto rounded-t-2xl border border-b-0 border-outline-variant bg-card-raised px-6 pt-6 text-text outline-none data-[state=open]:rise-in expanded:inset-x-auto expanded:top-1/2 expanded:bottom-auto expanded:left-1/2 expanded:w-full expanded:max-w-[560px] expanded:-translate-x-1/2 expanded:-translate-y-1/2 expanded:rounded-2xl expanded:border-b expanded:data-[state=open]:overlay-in"
        >
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-title">
              {t('quickEntry.title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="text"
                size="icon"
                aria-label={t('quickEntry.close')}
              >
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <QuickEntryLoader
            onSaved={(message, entryId) => {
              onSaved(message, entryId);
              onOpenChange(false);
            }}
            onClose={() => {
              onOpenChange(false);
            }}
            onNavigate={onNavigate}
            onSavingChange={setSaving}
            preset={preset}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
