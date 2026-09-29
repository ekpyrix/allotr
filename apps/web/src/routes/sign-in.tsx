import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type SubmitEvent } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/problem';
import type { ShellPath } from '@/lib/redirect';
import { textField } from '@/lib/form';
import { signIn, verifySignInCode } from '@/lib/session';
import { t } from '@/messages/t';

export function SignInPage({
  next,
  deleted = false,
}: {
  next: ShellPath;
  /** Arrived here after deleting their account. */
  deleted?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function finish() {
    await queryClient.invalidateQueries();
    await navigate({ to: next });
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  function submitPassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const result = await signIn(
        textField(form, 'email'),
        textField(form, 'password'),
      );
      if (result === 'two-factor') setStep('code');
      else await finish();
    });
  }

  function submitCode(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      try {
        await verifySignInCode(textField(form, 'code'));
      } catch (caught) {
        // Too many wrong codes end the challenge: back to the password.
        if (
          caught instanceof ApiError &&
          caught.problem.code === 'too_many_attempts_request_new_code'
        )
          setStep('password');
        throw caught;
      }
      await finish();
    });
  }

  // Keyed forms remount per step, so the password step's inputs and submit
  // button are not reused (and transitioned) as the code step's elements.
  if (step === 'code') {
    return (
      <AuthLayout title={t('signIn.codeTitle')} intro={t('signIn.codeIntro')}>
        <form key="code" className="grid gap-5" onSubmit={submitCode}>
          {/* A TOTP code (6 digits) or a backup code (letters and digits
              around a hyphen), so no numeric keypad and no autocorrect. */}
          <Field
            label={t('signIn.code')}
            hint={t('signIn.codeHint')}
            name="code"
            autoComplete="one-time-code"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            pattern="[\sA-Za-z0-9\-]{6,24}"
            required
            autoFocus
            className="h-11 font-mono text-lg tracking-widest"
          />
          <FormError message={error} />
          <Button type="submit" size="lg" className="h-11" disabled={pending}>
            {pending ? t('signIn.verifying') : t('signIn.verify')}
          </Button>
          <Button
            type="button"
            variant="link"
            className="justify-self-start px-0"
            onClick={() => {
              setStep('password');
              setError(null);
            }}
          >
            {t('signIn.otherAccount')}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('signIn.title')}
      {...(deleted ? { intro: t('signIn.deleted') } : {})}
    >
      <form key="password" className="grid gap-5" onSubmit={submitPassword}>
        <Field
          label={t('signIn.email')}
          name="email"
          type="email"
          autoComplete="username"
          required
        />
        <Field
          label={t('signIn.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormError message={error} />
        <Button type="submit" size="lg" className="h-11" disabled={pending}>
          {pending ? t('signIn.submitting') : t('signIn.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
