import { formatMoney, type Money } from '@allotr/shared';
import { Plus, X } from 'lucide-react';
import { FieldControl, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/messages/t';
import {
  lineField,
  MAX_SPLIT_LINES,
  type DraftField,
  type SplitLineDraft,
} from './draft.ts';
import type { CategoryOption } from './options.ts';

// One entry across several categories (FR-L5): a category and an amount
// per line, and what is still left to assign. The draft holds the lines;
// this only renders them.
export function SplitEditor({
  lines,
  options,
  currency,
  remainder,
  locale,
  error,
  mismatch,
  onLine,
  onAdd,
  onRemove,
  onEnd,
}: {
  lines: readonly SplitLineDraft[];
  options: readonly CategoryOption[];
  /** The lines' currency, once an account is chosen. */
  currency: string | undefined;
  /** Null while the total cannot be read. */
  remainder: Money | null;
  locale: string;
  error: (field: DraftField) => string | undefined;
  mismatch: string | undefined;
  onLine: (index: number, patch: Partial<SplitLineDraft>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onEnd: () => void;
}) {
  // A split keeps two lines; "Use one category" ends it.
  const removable = lines.length > 2;
  const left =
    remainder === null
      ? t('quickEntry.split.enterAmount')
      : remainder.amountMinor === 0
        ? t('quickEntry.split.assigned')
        : remainder.amountMinor > 0
          ? t('quickEntry.split.left', {
              amount: formatMoney(remainder, locale),
            })
          : t('quickEntry.split.over', {
              amount: formatMoney(
                { ...remainder, amountMinor: -remainder.amountMinor },
                locale,
              ),
            });

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-sm font-medium">
        {t('quickEntry.split.legend')}
      </legend>
      <ol className="grid gap-3">
        {lines.map((line, i) => {
          const n = String(i + 1);
          return (
            <li
              key={i}
              className={
                removable
                  ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)_auto] items-end gap-2'
                  : 'grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)] items-end gap-2'
              }
            >
              <FieldControl
                label={t('quickEntry.split.category', { n })}
                error={error(lineField(i, 'categoryId'))}
              >
                {(props) => (
                  <select
                    {...props}
                    name={lineField(i, 'categoryId')}
                    className={selectClass}
                    value={line.categoryId}
                    onChange={(e) => {
                      onLine(i, { categoryId: e.currentTarget.value });
                    }}
                  >
                    <option value="" disabled>
                      {t('quickEntry.chooseCategory')}
                    </option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </FieldControl>
              <FieldControl
                label={
                  currency === undefined
                    ? t('quickEntry.split.amount', { n })
                    : t('quickEntry.split.amountIn', { n, currency })
                }
                error={error(lineField(i, 'amount'))}
              >
                {(props) => (
                  <Input
                    {...props}
                    name={lineField(i, 'amount')}
                    inputMode="decimal"
                    autoComplete="off"
                    className="h-11 text-base"
                    value={line.amount}
                    onChange={(e) => {
                      onLine(i, { amount: e.currentTarget.value });
                    }}
                  />
                )}
              </FieldControl>
              {removable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="size-11"
                  aria-label={t('quickEntry.split.remove', { n })}
                  onClick={() => {
                    onRemove(i);
                  }}
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p
        // The form focuses this when the lines miss the amount.
        data-split-status
        tabIndex={-1}
        className="text-sm tabular-nums outline-none"
      >
        <span
          className={
            remainder === null || remainder.amountMinor === 0
              ? 'text-muted-foreground'
              : undefined
          }
        >
          {left}
        </span>
        {mismatch === undefined ? null : (
          <span className="block font-medium text-over">{mismatch}</span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {lines.length < MAX_SPLIT_LINES ? (
          <Button type="button" variant="outline" onClick={onAdd}>
            <Plus aria-hidden />
            {t('quickEntry.split.add')}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onEnd}>
          {t('quickEntry.split.end')}
        </Button>
      </div>
    </fieldset>
  );
}
