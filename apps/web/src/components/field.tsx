import { useId, type ComponentProps, type ReactNode } from 'react';
import { fieldClass, Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & ComponentProps<'input'>) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-describedby={hint === undefined ? undefined : hintId}
        {...input}
      />
      {hint === undefined ? null : (
        <p id={hintId} className="text-body text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  return (
    <p role="alert" className="min-h-6 text-body font-medium text-negative">
      {message}
    </p>
  );
}

export interface ControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

/** Label, error and hint around any control, wired for screen readers. */
export function FieldControl({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();
  const described = [
    error === undefined ? null : `${id}-error`,
    hint === undefined ? null : `${id}-hint`,
  ].filter((part) => part !== null);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': error === undefined ? undefined : true,
        'aria-describedby':
          described.length === 0 ? undefined : described.join(' '),
      })}
      {error === undefined ? null : (
        <p id={`${id}-error`} className="text-body font-medium text-negative">
          {error}
        </p>
      )}
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-body text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export const selectClass = fieldClass;
