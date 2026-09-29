import { cn } from '@/lib/utils';
import { rollerCells } from './digits.ts';

// The rolling hero number (spec §7.4), in CSS only so Today never loads
// Motion. Each digit is a 0–9 strip in a one-character mono cell, moved by
// translateY with the gentle spring; other characters crossfade. The
// strips are hidden from assistive technology, which reads the plain value
// beside them. Under reduced motion the durations are 0, so the final
// value shows at once.

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function DigitRoller({
  value,
  className,
}: {
  /** The formatted amount, e.g. from formatMoney. */
  value: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex font-mono tabular-nums', className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="inline-flex leading-none">
        {rollerCells(value).map((cell) =>
          cell.kind === 'digit' ? (
            <span
              key={cell.key}
              className="inline-block h-[1em] w-[1ch] overflow-hidden scrim-in"
            >
              <span
                className="flex flex-col transition-transform duration-(--dur-gentle) ease-(--ease-gentle)"
                style={{ transform: `translateY(-${String(cell.digit)}em)` }}
              >
                {DIGITS.map((digit) => (
                  <span key={digit} className="block h-[1em]">
                    {digit}
                  </span>
                ))}
              </span>
            </span>
          ) : (
            <span key={cell.key} className="inline-block h-[1em] scrim-in">
              {cell.char}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
