import {
  registrationModeSchema,
  type InstanceSettings,
  type RegistrationMode,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoment } from '@/features/ledger/format';
import { errorMessage } from '@/lib/problem';
import {
  createInvite,
  instanceSettingsQuery,
  sessionQuery,
  updateInstanceSettings,
} from '@/lib/session';
import { t } from '@/messages/t';
import { Section } from './section.tsx';

const modes = registrationModeSchema.options;
const lifetimes = [1, 7, 30] as const;

function InstanceForm({ settings }: { settings: InstanceSettings }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<RegistrationMode>(settings.registrationMode);
  const [requireTwoFactor, setRequireTwoFactor] = useState(
    settings.requireTwoFactor,
  );
  const [saved, setSaved] = useState(false);
  const modeName = useId();
  const twoFactorId = useId();
  const save = useMutation({
    mutationFn: updateInstanceSettings,
    onSuccess: async (next) => {
      queryClient.setQueryData(instanceSettingsQuery.queryKey, next);
      // The admin's own session says whether 2FA is enforced.
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
    },
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(
      { registrationMode: mode, requireTwoFactor },
      {
        onSuccess: () => {
          setSaved(true);
        },
      },
    );
  }

  const changed = () => {
    setSaved(false);
    if (save.isError) save.reset();
  };

  return (
    <form className="mt-4 grid max-w-md gap-5" onSubmit={submit} noValidate>
      <fieldset className="grid gap-3">
        <legend className="mb-1 font-medium">
          {t('settings.instance.registration')}
        </legend>
        {modes.map((option) => (
          <label key={option} className="flex items-start gap-3">
            <input
              type="radio"
              name={modeName}
              value={option}
              checked={mode === option}
              aria-describedby={`${modeName}-${option}`}
              onChange={() => {
                setMode(option);
                changed();
              }}
              className="mt-1 size-4 accent-primary"
            />
            <span>
              {t(`settings.instance.modes.${option}`)}
              <span
                id={`${modeName}-${option}`}
                className="block text-sm text-text-muted"
              >
                {t(`settings.instance.modeHints.${option}`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex items-start gap-3">
        <input
          id={twoFactorId}
          type="checkbox"
          checked={requireTwoFactor}
          aria-describedby={`${twoFactorId}-hint`}
          onChange={(e) => {
            setRequireTwoFactor(e.currentTarget.checked);
            changed();
          }}
          className="mt-1 size-4 accent-primary"
        />
        <div>
          <label htmlFor={twoFactorId} className="font-medium">
            {t('settings.instance.requireTwoFactor')}
          </label>
          <p id={`${twoFactorId}-hint`} className="text-sm text-text-muted">
            {t('settings.instance.requireTwoFactorHint')}
          </p>
        </div>
      </div>
      <FormError message={save.isError ? errorMessage(save.error) : null} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" className="h-11" disabled={save.isPending}>
          {save.isPending ? t('settings.saving') : t('settings.save')}
        </Button>
        <p role="status" className="text-sm text-text-muted">
          {saved ? t('settings.saved') : ''}
        </p>
      </div>
    </form>
  );
}

function InviteForm({
  locale,
  timeZone,
}: {
  locale: string;
  timeZone: string;
}) {
  const [days, setDays] = useState<number>(7);
  const [copied, setCopied] = useState(false);
  const create = useMutation({ mutationFn: createInvite });
  const invite = create.data;

  return (
    <div className="mt-10">
      <h3 className="text-lg font-semibold">
        {t('settings.instance.inviteTitle')}
      </h3>
      <p className="mt-1 max-w-prose text-sm text-text-muted">
        {t('settings.instance.inviteIntro')}
      </p>
      <form
        className="mt-4 flex max-w-md flex-wrap items-end gap-3"
        noValidate
        onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
          event.preventDefault();
          setCopied(false);
          create.mutate(days);
        }}
      >
        <div className="min-w-40 flex-1">
          <FieldControl label={t('settings.instance.expiresIn')}>
            {(props) => (
              <select
                {...props}
                name="expiresInDays"
                value={days}
                className={selectClass}
                onChange={(e) => {
                  setDays(Number(e.currentTarget.value));
                }}
              >
                {lifetimes.map((n) => (
                  <option key={n} value={n}>
                    {t('settings.instance.days', { count: n })}
                  </option>
                ))}
              </select>
            )}
          </FieldControl>
        </div>
        <Button type="submit" className="h-11" disabled={create.isPending}>
          {create.isPending
            ? t('settings.saving')
            : t('settings.instance.createInvite')}
        </Button>
      </form>
      <FormError message={create.isError ? errorMessage(create.error) : null} />
      {invite === undefined ? null : (
        <div className="mt-2 grid max-w-md gap-3">
          <FieldControl
            label={t('settings.instance.inviteLink')}
            hint={t('settings.instance.inviteLinkHint', {
              when: formatMoment(invite.expiresAt, locale, timeZone),
            })}
          >
            {(props) => (
              <Input
                {...props}
                readOnly
                value={invite.url}
                autoFocus
                onFocus={(e) => {
                  e.currentTarget.select();
                }}
                className="h-11 font-mono text-sm"
              />
            )}
          </FieldControl>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant="outlined"
              className="h-11"
              onClick={() => {
                void navigator.clipboard.writeText(invite.url).then(
                  () => {
                    setCopied(true);
                  },
                  () => undefined,
                );
              }}
            >
              {t('settings.instance.copy')}
            </Button>
            <p role="status" className="text-sm text-text-muted">
              {copied ? t('settings.instance.copied') : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Instance-wide settings for administrators: who may sign up, whether 2FA
// is required, and single-use invite links.
export function InstanceSection({
  locale,
  timeZone,
}: {
  locale: string;
  timeZone: string;
}) {
  const settings = useQuery(instanceSettingsQuery);
  return (
    <Section
      id="instance"
      title={t('settings.instance.title')}
      intro={t('settings.instance.intro')}
    >
      {settings.isError ? (
        <div className="mt-4 grid justify-items-start gap-3">
          <FormError message={errorMessage(settings.error)} />
          <Button
            variant="outlined"
            onClick={() => {
              void settings.refetch();
            }}
          >
            {t('errors.retry')}
          </Button>
        </div>
      ) : settings.data === undefined ? (
        <p className="mt-4 text-sm text-text-muted">{t('settings.loading')}</p>
      ) : (
        <InstanceForm settings={settings.data} />
      )}
      <InviteForm locale={locale} timeZone={timeZone} />
    </Section>
  );
}
