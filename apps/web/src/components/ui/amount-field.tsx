import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldClass } from './input.tsx';

// An amount input (spec §8.2): mono, right-aligned, with the currency as an
// adornment and the decimal keypad on phones. It only collects text; the
// shared money utilities parse it.

function AmountField({
  currency,
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type' | 'inputMode'> & {
  /** The currency code or symbol shown before the digits. */
  currency: string;
}) {
  return (
    <div data-slot="amount-field" className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-mono text-body text-text-muted"
      >
        {currency}
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn(fieldClass, 'pl-16 text-right font-mono', className)}
        {...props}
      />
    </div>
  );
}

export { AmountField };
