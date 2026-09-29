import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { t } from '@/messages/t';

// A bottom sheet on phones and a centred dialog from `sm` up, as quick
// entry and the ledger use. Focus starts on the title and returns to what
// opened it; when that is gone (a row that moved or was archived) it goes
// to `fallback`, or to <main>.
// A pending request cannot be dismissed, so its result is never lost.
export function Sheet({
  open,
  title,
  busy,
  onClose,
  fallback,
  children,
}: {
  open: boolean;
  title: string;
  busy: boolean;
  onClose: () => void;
  fallback?: () => HTMLElement | null;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            opener.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            heading.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const back = opener.current;
            opener.current = null;
            (back?.isConnected === true
              ? back
              : (fallback?.() ?? document.querySelector<HTMLElement>('main'))
            )?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-40 max-h-[90dvh] overflow-y-auto rounded-t-lg border bg-background p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lg outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg"
        >
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title
              ref={heading}
              tabIndex={-1}
              className="text-xl font-semibold wrap-anywhere outline-none"
            >
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('accounts.close')}
                disabled={busy}
              >
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
