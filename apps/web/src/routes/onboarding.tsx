import { MIN_PASSWORD_LENGTH } from '@allotr/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type SubmitEvent } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import { textField } from '@/lib/form';
import { createFirstAccount } from '@/lib/session';

export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await createFirstAccount({
        name: textField(form, 'name'),
        email: textField(form, 'email'),
        password: textField(form, 'password'),
      });
      await queryClient.invalidateQueries();
      await navigate({ to: '/today' });
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <AuthLayout
      title="Set up Allotr"
      intro="This first account runs the instance. You can invite others once you are in."
    >
      <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
        <Field
          label="Name"
          name="name"
          autoComplete="name"
          required
          maxLength={100}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          hint={`At least ${String(MIN_PASSWORD_LENGTH)} characters.`}
        />
        <FormError message={error} />
        <Button type="submit" size="lg" className="h-11" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
