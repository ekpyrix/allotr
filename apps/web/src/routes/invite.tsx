import { MIN_PASSWORD_LENGTH } from '@allotr/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type SubmitEvent } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { textField } from '@/lib/form';
import { errorMessage } from '@/lib/problem';
import { acceptInvite, inviteQuery } from '@/lib/session';
import { t } from '@/messages/t';

// Signing up with a single-use invite link from an administrator.
export function InvitePage({ token }: { token: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invite = useQuery(inviteQuery(token));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await acceptInvite(token, {
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

  if (invite.isError) {
    const invalid =
      invite.error instanceof ApiError && invite.error.status === 404;
    return (
      <AuthLayout
        title={t('invite.invalidTitle')}
        intro={invalid ? t('invite.invalid') : errorMessage(invite.error)}
      >
        {invalid ? (
          <Link
            to="/sign-in"
            className="font-medium underline underline-offset-4"
          >
            {t('invite.signIn')}
          </Link>
        ) : (
          <Button
            onClick={() => {
              void invite.refetch();
            }}
          >
            {t('errors.retry')}
          </Button>
        )}
      </AuthLayout>
    );
  }

  if (invite.data === undefined)
    return (
      <AuthLayout title={t('invite.title')}>
        <p role="status" className="text-text-muted">
          {t('invite.checking')}
        </p>
      </AuthLayout>
    );

  return (
    <AuthLayout title={t('invite.title')} intro={t('invite.intro')}>
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
