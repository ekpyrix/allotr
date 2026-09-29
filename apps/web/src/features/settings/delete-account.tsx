import type { SessionView } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/features/accounts/sheet';
import { textField } from '@/lib/form';
import { errorMessage } from '@/lib/problem';
import { deleteUser } from '@/lib/session';
import { t } from '@/messages/t';
import { Section } from './section.tsx';

// Deleting the account (FR-U3): a hard delete, confirmed with the password
// and, with 2FA on, a TOTP or backup code. The dialog offers a backup
// first. Outline buttons with destructive text: the filled destructive
// variant fails contrast in the dark theme. They keep the outline fills,
// which the contrast validator checks destructive text against.

const destructive =
  'h-11 border-destructive text-destructive hover:text-destructive';

function DeleteForm({
  session,
  onBusyChange,
  onCancel,
}: {
  session: SessionView;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const twoFactor = session.user.twoFactorEnabled;
  const remove = useMutation({
    mutationFn: (body: { password: string; code?: string }) =>
      deleteUser(queryClient, body),
    onMutate: () => {
      onBusyChange(true);
    },
    onSettled: () => {
      onBusyChange(false);
    },
    onSuccess: () => navigate({ to: '/sign-in', search: { deleted: true } }),
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = textField(form, 'code').replace(/\s/g, '');
    remove.mutate({
      password: textField(form, 'password'),
      ...(twoFactor && code !== '' ? { code } : {}),
    });
  }

  return (
    <div className="mt-4 grid gap-5">
      <p>{t('settings.deleteAccount.what')}</p>
      {/* Held to 2FA enrolment, the user cannot export yet. */}
      {session.twoFactorRequired ? null : (
        <div className="grid justify-items-start gap-2">
          <p className="text-sm text-muted-foreground">
            {t('settings.deleteAccount.exportFirst')}
          </p>
          <Button asChild variant="outline" className="h-11">
            <a href="/v1/export?format=json" download>
              <Download aria-hidden="true" />
              {t('settings.export.json.label')}
            </a>
          </Button>
        </div>
      )}
      <form className="grid gap-5" noValidate onSubmit={submit}>
        <Field
          label={t('settings.security.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {twoFactor ? (
          <Field
            label={t('settings.security.code')}
            hint={t('settings.deleteAccount.codeHint')}
            name="code"
            autoComplete="one-time-code"
            required
            className="h-11 font-mono text-lg tracking-widest"
          />
        ) : null}
        <FormError
          message={remove.isError ? errorMessage(remove.error) : null}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            variant="outline"
            className={destructive}
            disabled={remove.isPending}
          >
            {remove.isPending
              ? t('settings.deleteAccount.deleting')
              : t('settings.deleteAccount.confirm')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={remove.isPending}
            onClick={onCancel}
          >
            {t('settings.cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function DeleteAccountSection({ session }: { session: SessionView }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Section
      id="delete-account"
      title={t('settings.deleteAccount.title')}
      intro={t('settings.deleteAccount.intro')}
    >
      <Button
        variant="outline"
        className={`mt-4 ${destructive}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('settings.deleteAccount.open')}
      </Button>
      <Sheet
        open={open}
        title={t('settings.deleteAccount.dialogTitle')}
        busy={busy}
        onClose={() => {
          setOpen(false);
        }}
        fallback={() => document.getElementById('delete-account-title')}
      >
        {open ? (
          <DeleteForm
            session={session}
            onBusyChange={setBusy}
            onCancel={() => {
              setOpen(false);
            }}
          />
        ) : null}
      </Sheet>
    </Section>
  );
}
