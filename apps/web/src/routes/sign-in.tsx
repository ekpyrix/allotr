import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type SubmitEvent } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/problem';
import type { ShellPath } from '@/lib/redirect';
import { textField } from '@/lib/form';
import { signIn, verifyTotp } from '@/lib/session';

export function SignInPage({ next }: { next: ShellPath }) {
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
      await verifyTotp(textField(form, 'code').replace(/\s/g, ''));
      await finish();
    });
  }

  if (step === 'code') {
    return (
      <AuthLayout
        title="Enter your code"
        intro="Open your authenticator app and enter the 6-digit code for Allotr."
      >
        <form className="grid gap-5" onSubmit={submitCode}>
          <Field
            label="Code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            required
            autoFocus
            className="h-11 font-mono text-lg tracking-widest"
          />
          <FormError message={error} />
          <Button type="submit" size="lg" className="h-11" disabled={pending}>
            {pending ? 'Checking…' : 'Verify'}
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
            Use a different account
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in">
      <form className="grid gap-5" onSubmit={submitPassword}>
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormError message={error} />
        <Button type="submit" size="lg" className="h-11" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
