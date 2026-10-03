import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/features/budget/money-input';
import { t } from '@/messages/t';
import { emptyPerson, type PersonDraft, type PersonError } from './draft.ts';
import { PeopleInput } from './people-input.tsx';

/** The most people the server takes in one entry. */
export const MAX_PEOPLE = 20;

/**
 * "Split with people" in the entry sheet. The amount typed above is the
 * user's own share; each person adds what they owe on top, and the
 * account pays the shares together.
 */
export function SplitPeople({
  people,
  errors,
  currency,
  locale,
  onChange,
}: {
  people: readonly PersonDraft[] | null;
  errors: Readonly<Record<number, PersonError>>;
  currency: string;
  locale: string;
  onChange: (people: readonly PersonDraft[] | null) => void;
}) {
  const toggleId = useId();
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
      {people === null ? null : (
        <>
          <p className="text-caption text-text-muted">
            {t('budget.ious.split.hint')}
          </p>
          {people.map((p, index) => (
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
                    people.map((q, i) => (i === index ? { ...q, amount } : q)),
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
