import type { SessionView } from '@allotr/shared';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useId, useMemo, useState, type SubmitEvent } from 'react';
import { renderSVG } from 'uqr';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { formatMoment } from '@/features/ledger/format';
import type { AuthSession } from '@/lib/endpoints';
import { errorMessage } from '@/lib/problem';
import {
  authSessionsQuery,
  disableTwoFactor,
  enableTwoFactor,
  revokeOtherSessions,
  revokeSession,
  sessionQuery,
  signOut,
  verifyTotp,
} from '@/lib/session';
import { t } from '@/messages/t';
import { deviceParts } from './device.ts';
import { Section } from './section.tsx';

async function refreshSession(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey }),
    queryClient.invalidateQueries({ queryKey: authSessionsQuery.queryKey }),
  ]);
}

/** The base32 secret in an otpauth URI, in groups of four for typing. */
function secretOf(uri: string): string {
  const secret = new URL(uri).searchParams.get('secret') ?? '';
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

function PasswordStep({
  label,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="mt-4 grid max-w-md gap-5"
      noValidate
      onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get('password');
        onSubmit(typeof value === 'string' ? value : '');
      }}
    >
      <Field
        label={label}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
      />
      <FormError message={error} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="h-11" disabled={pending}>
          {pending ? t('settings.security.checking') : submitLabel}
        </Button>
        <Button
          type="button"
          variant="outlined"
          className="h-11"
          disabled={pending}
          onClick={onCancel}
        >
          {t('settings.cancel')}
        </Button>
      </div>
    </form>
  );
}

function Enrolment({
  totpURI,
  backupCodes,
  onDone,
  onCancel,
}: {
  totpURI: string;
  backupCodes: readonly string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const codesId = useId();
  const qr = useMemo(
    () =>
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        renderSVG(totpURI, { border: 2 }),
      )}`,
    [totpURI],
  );
  const verify = useMutation({
    mutationFn: verifyTotp,
    onSuccess: async () => {
      await refreshSession(queryClient);
    },
  });

  return (
    <div className="mt-4 grid max-w-md gap-5">
      <h3 className="text-lg font-semibold">
        {t('settings.security.scanTitle')}
      </h3>
      <p>{t('settings.security.scanIntro')}</p>
      <img
        src={qr}
        alt={t('settings.security.qrAlt')}
        width={200}
        height={200}
        className="rounded-md bg-white p-2"
      />
      <p className="text-sm">
        {t('settings.security.secretIntro')}{' '}
        <code data-testid="totp-secret" className="font-mono break-all">
          {secretOf(totpURI)}
        </code>
      </p>
      <div>
        <h4 id={codesId} className="font-medium">
          {t('settings.security.backupTitle')}
        </h4>
        <p className="text-sm text-text-muted">
          {t('settings.security.backupIntro')}
        </p>
        <ul
          aria-labelledby={codesId}
          className="mt-2 grid grid-cols-2 gap-1 font-mono"
        >
          {backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </div>
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get('code');
          const code = (typeof value === 'string' ? value : '').replace(
            /\s/g,
            '',
          );
          verify.mutate(code, { onSuccess: onDone });
        }}
      >
        <Field
          label={t('settings.security.code')}
          hint={t('settings.security.codeHint')}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          className="h-11 font-mono text-lg tracking-widest"
        />
        <FormError
          message={verify.isError ? errorMessage(verify.error) : null}
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" className="h-11" disabled={verify.isPending}>
            {verify.isPending
              ? t('settings.security.checking')
              : t('settings.security.turnOnSubmit')}
          </Button>
          <Button
            type="button"
            variant="outlined"
            className="h-11"
            disabled={verify.isPending}
            onClick={onCancel}
          >
            {t('settings.cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}

type Step =
  | { kind: 'idle' }
  | { kind: 'password' }
  | { kind: 'scan'; totpURI: string; backupCodes: readonly string[] };

function TwoFactor({ session }: { session: SessionView }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [status, setStatus] = useState('');
  const enabled = session.user.twoFactorEnabled;
  const enable = useMutation({ mutationFn: enableTwoFactor });
  const disable = useMutation({
    mutationFn: disableTwoFactor,
    onSuccess: async () => {
      await refreshSession(queryClient);
    },
  });
  const cancel = () => {
    enable.reset();
    disable.reset();
    setStep({ kind: 'idle' });
  };

  return (
    <div className="mt-4">
      <h3 id="two-factor-title" className="text-lg font-semibold">
        {t('settings.security.twoFactorTitle')}
      </h3>
      <p className="mt-1 max-w-prose text-sm text-text-muted">
        {enabled
          ? t('settings.security.twoFactorOn')
          : t('settings.security.twoFactorOff')}
      </p>
      <p role="status" className="mt-2 text-sm font-medium">
        {status}
      </p>
      {step.kind === 'scan' ? (
        <Enrolment
          totpURI={step.totpURI}
          backupCodes={step.backupCodes}
          onCancel={cancel}
          onDone={() => {
            setStep({ kind: 'idle' });
            setStatus(t('settings.security.turnedOn'));
          }}
        />
      ) : step.kind === 'password' ? (
        <PasswordStep
          label={t('settings.security.password')}
          submitLabel={
            enabled
              ? t('settings.security.turnOffSubmit')
              : t('settings.security.continue')
          }
          pending={enable.isPending || disable.isPending}
          error={
            enable.isError
              ? errorMessage(enable.error)
              : disable.isError
                ? errorMessage(disable.error)
                : null
          }
          onCancel={cancel}
          onSubmit={(password) => {
            if (enabled) {
              disable.mutate(password, {
                onSuccess: () => {
                  setStep({ kind: 'idle' });
                  setStatus(t('settings.security.turnedOff'));
                },
              });
            } else {
              enable.mutate(password, {
                onSuccess: ({ totpURI, backupCodes }) => {
                  setStep({ kind: 'scan', totpURI, backupCodes });
                },
              });
            }
          }}
        />
      ) : enabled && session.twoFactorEnforced ? (
        <p className="mt-2 max-w-prose text-sm">
          {t('settings.security.enforced')}
        </p>
      ) : (
        <Button
          variant={enabled ? 'outlined' : 'filled'}
          className="mt-2 h-11"
          onClick={() => {
            setStatus('');
            setStep({ kind: 'password' });
          }}
        >
          {enabled
            ? t('settings.security.turnOff')
            : t('settings.security.turnOn')}
        </Button>
      )}
    </div>
  );
}

function deviceName(session: AuthSession): string {
  const { browser, system } = deviceParts(session.userAgent);
  if (browser !== undefined && system !== undefined)
    return t('settings.security.deviceOn', { browser, system });
  return browser ?? system ?? t('settings.security.unknownDevice');
}

function Devices({ locale, timeZone }: { locale: string; timeZone: string }) {
  const queryClient = useQueryClient();
  const devices = useQuery(authSessionsQuery);
  const [status, setStatus] = useState('');
  const revokeOne = useMutation({
    mutationFn: revokeSession,
    onSuccess: async () => {
      await refreshSession(queryClient);
    },
  });
  const revokeOthers = useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: async () => {
      await refreshSession(queryClient);
    },
  });
  const failure = revokeOne.error ?? revokeOthers.error;

  return (
    <div className="mt-10">
      <h3
        id="devices-title"
        tabIndex={-1}
        className="text-lg font-semibold outline-none"
      >
        {t('settings.security.devicesTitle')}
      </h3>
      <p role="status" className="mt-1 text-sm font-medium">
        {status}
      </p>
      {devices.isError ? (
        <div className="mt-2 grid justify-items-start gap-3">
          <FormError message={errorMessage(devices.error)} />
          <Button
            variant="outlined"
            onClick={() => {
              void devices.refetch();
            }}
          >
            {t('errors.retry')}
          </Button>
        </div>
      ) : devices.data === undefined ? (
        <p className="mt-2 text-sm text-text-muted">{t('settings.loading')}</p>
      ) : (
        <>
          <ul
            aria-labelledby="devices-title"
            className="mt-2 divide-y rounded-md bg-card px-4"
          >
            {[...devices.data.sessions]
              .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
              .map((device) => {
                const current = device.token === devices.data.currentToken;
                const name = deviceName(device);
                return (
                  <li
                    key={device.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
                  >
                    <span className="grid gap-0.5">
                      <span className="font-medium">
                        {name}
                        {current ? (
                          <span className="ml-2 text-sm font-normal text-text-muted">
                            {t('settings.security.thisDevice')}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm text-text-muted">
                        {t('settings.security.lastActive', {
                          when: formatMoment(
                            device.updatedAt.toISOString(),
                            locale,
                            timeZone,
                          ),
                        })}
                        {device.ipAddress == null || device.ipAddress === ''
                          ? ''
                          : ` · ${device.ipAddress}`}
                      </span>
                    </span>
                    {current ? null : (
                      <Button
                        variant="outlined"
                        size="dense"
                        disabled={revokeOne.isPending}
                        onClick={() => {
                          revokeOne.mutate(device.token, {
                            onSuccess: () => {
                              document.getElementById('devices-title')?.focus();
                              setStatus(
                                t('settings.security.revoked', { name }),
                              );
                            },
                          });
                        }}
                      >
                        {t('settings.signOut')}
                        <span className="sr-only">
                          {' '}
                          {name},{' '}
                          {formatMoment(
                            device.updatedAt.toISOString(),
                            locale,
                            timeZone,
                          )}
                        </span>
                      </Button>
                    )}
                  </li>
                );
              })}
          </ul>
          <FormError
            message={failure === null ? null : errorMessage(failure)}
          />
          {devices.data.sessions.length > 1 ? (
            <Button
              variant="outlined"
              className="mt-2 h-11"
              disabled={revokeOthers.isPending}
              onClick={() => {
                revokeOthers.mutate(undefined, {
                  onSuccess: () => {
                    setStatus(t('settings.security.revokedOthers'));
                  },
                });
              }}
            >
              {t('settings.security.revokeOthers')}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function SignOutButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <Button
      variant="outlined"
      className="mt-10 h-11"
      onClick={() => {
        void signOut(queryClient).then(() => navigate({ to: '/sign-in' }));
      }}
    >
      {t('settings.signOut')}
    </Button>
  );
}

// Two-factor authentication and signed-in devices. It needs only the
// session, so it also works for a user the instance holds to enrolment.
export function SecuritySection({
  session,
  locale,
  timeZone,
}: {
  session: SessionView;
  locale: string;
  timeZone: string;
}) {
  return (
    <Section
      id="security"
      title={t('settings.security.title')}
      intro={t('settings.security.signedInAs', { email: session.user.email })}
    >
      <TwoFactor session={session} />
      <Devices locale={locale} timeZone={timeZone} />
      <SignOutButton />
    </Section>
  );
}
