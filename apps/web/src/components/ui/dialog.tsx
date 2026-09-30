import * as React from 'react';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { IconButton } from './icon-button.tsx';

// Dialog (spec §8.2): card-raised with a hairline and a scrim, no shadow,
// `--radius-2xl`, at most 560 px wide. It fades and scales in with the
// snappy spring and fades out on the exit easing. Radix keeps focus
// trapped and returns it to the opener.

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=closed]:scrim-out data-[state=open]:scrim-in dark:bg-black/60" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-outline-variant bg-card-raised p-6 text-text data-[state=closed]:overlay-out data-[state=open]:overlay-in',
          className,
        )}
        {...(description === undefined
          ? { 'aria-describedby': undefined }
          : {})}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <DialogPrimitive.Title className="pt-3 text-title">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <IconButton aria-label={t('ui.close')} className="-mt-1 -mr-3">
              <X />
            </IconButton>
          </DialogPrimitive.Close>
        </div>
        {description === undefined ? null : (
          <DialogPrimitive.Description className="mt-2 text-body text-text-muted">
            {description}
          </DialogPrimitive.Description>
        )}
        <div className="mt-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogClose, DialogContent, DialogTrigger };
