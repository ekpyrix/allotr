import * as React from 'react';
import { Check } from 'lucide-react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// Switch (spec §8.2): the thumb grows from 16 to 24 px (by scale) when on and shows a
// check, with the bouncy spring (small controls only). The track outline
// and the on fill both meet 3:1 against the page.

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer group relative inline-flex h-8 w-13 shrink-0 cursor-pointer items-center rounded-full border-2 border-outline bg-card-raised outline-none transition-colors duration-(--dur-fade) before:absolute before:-inset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none flex size-6 translate-x-0.5 scale-[0.667] items-center justify-center rounded-full bg-outline transition-[translate,scale,background-color] duration-(--dur-bouncy) ease-(--ease-bouncy) data-[state=checked]:translate-x-5 data-[state=checked]:scale-100 data-[state=checked]:bg-on-primary"
      >
        <Check
          aria-hidden="true"
          className="size-4 text-primary opacity-0 transition-opacity duration-(--dur-fade) group-data-[state=checked]:opacity-100"
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
