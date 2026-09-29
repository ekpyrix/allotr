import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Filled tonal text field (spec §8.2): a card-raised fill with an outline
 * edge (3:1 against the page), a primary edge while focused plus the focus
 * ring, and 16 px text so phones never zoom.
 */
export const fieldClass =
  'h-12 w-full min-w-0 rounded-md border border-outline bg-card-raised px-4 text-base text-text outline-none placeholder:text-text-muted transition-[border-color] duration-(--dur-fade) selection:bg-primary selection:text-on-primary file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-2 aria-invalid:border-negative';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldClass, className)}
      {...props}
    />
  );
}

export { Input };
