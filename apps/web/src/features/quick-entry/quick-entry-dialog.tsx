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
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';
import { QuickEntryForm } from './quick-entry-form.tsx';

function QuickEntryLoader({
  onSaved,
  onClose,
  onSavingChange,
}: {
  onSaved: (message: string) => void;
  onClose: () => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const tags = useQuery(tagsQuery);
  const settings = useQuery(ledgerSettingsQuery);
  const today = useQuery(todayQuery);
  const all = [accounts, categories, tags, settings, today];

  // A failed background refetch keeps the form (and what was typed) as long
  // as there is data to show.
  const failing = (query: (typeof all)[number]) =>
    query.isError && query.data === undefined;
  const failed = all.find(failing);
  if (failed !== undefined)
    return (
      <div className="mt-6 grid gap-4">
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
      <p role="status" className="mt-6 text-muted-foreground">
        {t('quickEntry.loading')}
      </p>
    );
  // Archived accounts stay in the ledger but cannot take new entries.
  const open = accounts.data.accounts.filter((a) => !a.archived);
  if (open.length === 0)
    return (
      <div className="mt-6 grid gap-4">
        <p>{t('quickEntry.noAccounts')}</p>
        <Link
          to="/accounts"
          onClick={onClose}
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
      onSaved={onSaved}
      onSavingChange={onSavingChange}
    />
  );
}

// Centred on wider screens, a bottom sheet on phones. Radix traps focus and
// closes on Escape; the provider gives focus back to whatever opened it. A
// pending save cannot be dismissed, so its result is never lost and a retry
// cannot duplicate the entry.
export function QuickEntryDialog({
  open,
  onOpenChange,
  onSaved,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: string) => void;
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
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
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
          className="fixed inset-x-0 bottom-0 z-40 max-h-[90dvh] overflow-y-auto rounded-t-lg border bg-background p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lg outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg"
        >
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-xl font-semibold">
              {t('quickEntry.title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('quickEntry.close')}
              >
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <QuickEntryLoader
            onSaved={(message) => {
              onSaved(message);
              onOpenChange(false);
            }}
            onClose={() => {
              onOpenChange(false);
            }}
            onSavingChange={setSaving}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
