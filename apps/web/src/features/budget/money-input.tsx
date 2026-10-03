import { FieldControl } from '@/components/field';
import { AmountField } from '@/components/ui/amount-field';
import { amountExample } from '@/features/quick-entry/draft';
import type { AmountError } from '@/features/settings/bill-draft';
import { t } from '@/messages/t';

export function amountErrorText(
  error: AmountError | undefined,
  currency: string,
  locale: string,
): string | undefined {
  switch (error) {
    case undefined:
      return undefined;
    case 'required':
      return t('budget.errors.amountRequired');
    case 'decimals':
      return t('budget.errors.amountDecimals');
    case 'positive':
      return t('budget.errors.amountPositive');
    case 'invalid':
      return t('budget.errors.amountInvalid', {
        example: amountExample(currency, locale),
      });
  }
}

/** A labelled amount field that only collects text; parsing is shared. */
export function MoneyInput({
  label,
  name,
  value,
  currency,
  locale,
  error,
  hint,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  currency: string;
  locale: string;
  error?: AmountError | undefined;
  hint?: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <FieldControl
      label={label}
      error={amountErrorText(error, currency, locale)}
      hint={hint}
    >
      {(props) => (
        <AmountField
          {...props}
          name={name}
          currency={currency}
          value={value}
          onChange={(e) => {
            onChange(e.currentTarget.value);
          }}
        />
      )}
    </FieldControl>
  );
}
