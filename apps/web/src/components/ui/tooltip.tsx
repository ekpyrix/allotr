import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// Tooltips on the inverse surface (spec §8.2). They only repeat what the
// control already says; anything a user must read goes in the page.

const TooltipProvider = TooltipPrimitive.Provider;

function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className={cn(
            'z-50 max-w-64 rounded-sm bg-inverse px-2 py-1 text-label text-on-inverse data-[state=closed]:scrim-out data-[state=delayed-open]:scrim-in',
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export { Tooltip, TooltipProvider };
