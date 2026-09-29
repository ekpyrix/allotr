import { MIN_PASSWORD_LENGTH } from '@allotr/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type SubmitEvent } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/problem';
import { textField } from '@/lib/form';
import { createFirstAccount } from '@/lib/session';
import { t } from '@/messages/t';

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
    <AuthLayout title={t('onboarding.title')} intro={t('onboarding.intro')}>
      <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
        <Field
          label={t('onboarding.name')}
          name="name"
          autoComplete="name"
          required
          maxLength={100}
        />
        <Field
          label={t('onboarding.email')}
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        <Field
          label={t('onboarding.password')}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          hint={t('onboarding.passwordHint', { min: MIN_PASSWORD_LENGTH })}
        />
        <FormError message={error} />
        <Button type="submit" className="h-11" disabled={pending}>
          {pending ? t('onboarding.submitting') : t('onboarding.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
