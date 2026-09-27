import { useId, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
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
        className="h-11 text-base"
        {...input}
      />
      {hint === undefined ? null : (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  return (
    <p role="alert" className="min-h-6 text-sm font-medium text-over">
      {message}
    </p>
  );
}
