import { formatMoney, type Money } from '@allotr/shared';
import { Equal, Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/features/budget/money-input';
import { t } from '@/messages/t';
import {
  emptyPerson,
  fillEven,
  ownShareOf,
  type PersonDraft,
  type PersonError,
  type TotalError,
} from './draft.ts';
import { PeopleInput } from './people-input.tsx';

/** The most people the server takes in one entry. */
export const MAX_PEOPLE = 20;

/**
 * "Split with people" in the entry sheet. The amount typed above is the
 * whole bill the account paid. Each person owes an even share until the
 * user types their amount, and what is left is the user's own share.
 */
export function SplitPeople({
  people,
  errors,
  totalError,
  total,
  currency,
  locale,
  onChange,
}: {
  people: readonly PersonDraft[] | null;
  errors: Readonly<Record<number, PersonError>>;
  totalError?: TotalError | undefined;
  /** The bill as typed above, or null while it does not read as money. */
  total: Money | null;
  currency: string;
  locale: string;
  onChange: (people: readonly PersonDraft[] | null) => void;
}) {
  const toggleId = useId();
  // Amounts nobody typed are shown, and saved, as even shares.
  const shown = people === null ? null : fillEven(people, total, locale);
  const own = shown === null ? null : ownShareOf(total, shown, locale);
  return (
    <fieldset className="grid gap-3 rounded-md border border-outline-variant p-3">
      <legend className="px-1 text-sm font-medium">
        {t('budget.ious.split.title')}
      </legend>
      <div className="flex items-center gap-3">
        <input
          id={toggleId}
          type="checkbox"
          className="size-5"
          checked={people !== null}
          onChange={(e) => {
            onChange(e.currentTarget.checked ? [emptyPerson] : null);
          }}
        />
        <label htmlFor={toggleId} className="text-body">
          {t('budget.ious.split.toggle')}
        </label>
      </div>
      {people === null || shown === null ? null : (
        <>
          <p className="text-caption text-text-muted">
            {t('budget.ious.split.hint')}
          </p>
          {shown.map((p, index) => (
            // Rows have no identity of their own; they are edited in place.
            <div key={index} className="grid gap-3 rounded-md bg-card p-3">
              <PeopleInput
                label={t('budget.ious.split.person', { n: index + 1 })}
                name={`people.${String(index)}.person`}
                value={p.person}
                error={
                  errors[index] === 'person'
                    ? t('budget.ious.errors.person')
                    : undefined
                }
                onChange={(person) => {
                  onChange(
                    people.map((q, i) => (i === index ? { ...q, person } : q)),
                  );
                }}
              />
              <MoneyInput
                label={t('budget.ious.split.owes', { n: index + 1 })}
                name={`people.${String(index)}.amount`}
                value={p.amount}
                currency={currency}
                locale={locale}
                error={errors[index] === 'amount' ? 'invalid' : undefined}
                onChange={(amount) => {
                  onChange(
                    people.map((q, i) =>
                      i === index ? { ...q, amount, edited: true } : q,
                    ),
                  );
                }}
              />
              {people.length > 1 ? (
                <Button
                  type="button"
                  variant="text"
                  size="dense"
                  className="w-fit"
                  onClick={() => {
                    onChange(people.filter((_, i) => i !== index));
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  {t('budget.ious.split.remove', { n: index + 1 })}
                </Button>
              ) : null}
            </div>
          ))}
          <p className="text-body" aria-live="polite">
            {totalError === 'exceeds' || (own !== null && own.amountMinor < 0)
              ? t('budget.ious.split.exceeds')
              : own === null
                ? null
                : own.amountMinor === 0
                  ? t('budget.ious.split.allOwed')
                  : t('budget.ious.split.yourShare', {
                      amount: formatMoney(own, locale),
                    })}
          </p>
          {people.some((p) => p.edited === true) ? (
            <Button
              type="button"
              variant="text"
              size="dense"
              className="w-fit"
              onClick={() => {
                onChange(people.map((p) => ({ ...p, edited: false })));
              }}
            >
              <Equal aria-hidden="true" />
              {t('budget.ious.split.evenly')}
            </Button>
          ) : null}
          {people.length < MAX_PEOPLE ? (
            <Button
              type="button"
              variant="outlined"
              size="dense"
              className="w-fit"
              onClick={() => {
                onChange([...people, emptyPerson]);
              }}
            >
              <Plus aria-hidden="true" />
              {t('budget.ious.split.add')}
            </Button>
          ) : null}
        </>
      )}
    </fieldset>
  );
}
