import type { ReactNode } from 'react';
import {
  Input,
  Label,
  Text,
  TextField as AriaTextField,
  type Selection,
} from 'react-aria-components';
import { MenuButton, MenuRadioItem } from '@/components/menu';

// The two controls the detail sheets share: a text field with its label and
// error, and a choice that opens an in-app menu (never a native select).

export function TextField({
  label,
  value,
  onChange,
  error,
  placeholder,
  inputMode,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  placeholder?: string | undefined;
  inputMode?: 'text' | 'decimal' | 'numeric' | undefined;
  autoFocus?: boolean | undefined;
}) {
  return (
    <AriaTextField
      value={value}
      onChange={onChange}
      isInvalid={error !== undefined}
      {...(autoFocus === true ? { autoFocus: true } : {})}
      className="flex flex-col gap-1"
    >
      <Label className="text-small text-text-muted">{label}</Label>
      <Input
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(inputMode === undefined ? {} : { inputMode })}
        className="h-8 w-full min-w-0 border border-outline bg-canvas px-2 font-sans text-small text-text aria-[invalid=true]:border-negative"
      />
      {error === undefined ? null : (
        <Text slot="errorMessage" className="text-small text-negative">
          {error}
        </Text>
      )}
    </AriaTextField>
  );
}

export type Choice = Readonly<{ id: string; label: string }>;

/** A labelled `label · value ▾` menu over a short list. */
export function ChoiceField({
  label,
  value,
  choices,
  placeholder,
  onChange,
  error,
}: {
  label: string;
  value: string;
  choices: readonly Choice[];
  placeholder: string;
  onChange: (id: string) => void;
  error?: string | undefined;
}) {
  const chosen = choices.find((c) => c.id === value);
  return (
    <div className="flex flex-col gap-1">
      <MenuButton
        label={label}
        value={chosen?.label ?? placeholder}
        selectionMode="single"
        selectedKeys={new Set(value === '' ? [] : [value])}
        onSelectionChange={(keys: Selection) => {
          const [first] = keys === 'all' ? [] : [...keys];
          if (first !== undefined) onChange(String(first));
        }}
        className="w-full"
      >
        {choices.map((choice) => (
          <MenuRadioItem key={choice.id} id={choice.id} label={choice.label} />
        ))}
      </MenuButton>
      {error === undefined ? null : (
        <p role="alert" className="text-small text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}
