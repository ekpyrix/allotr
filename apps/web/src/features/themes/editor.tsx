import {
  formatContrastRatio,
  THEME_SCHEMES,
  type CustomTheme,
  type NamedTheme,
  type ThemeBody,
  type ThemeToken,
} from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useId, useState, type SubmitEvent } from 'react';
import { FieldControl, FormError, selectClass } from '@/components/field';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  appearanceQuery,
  createTheme,
  themesQuery,
  updateTheme,
} from '@/lib/appearance';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import {
  checkDraft,
  draftFrom,
  pickerValue,
  TOKEN_GROUPS,
  type DraftCheck,
  type ThemeDraft,
} from './draft.ts';
import { pairKey, pairText, surfaceLabel, tokenLabel } from './labels.ts';
import { ThemePreview } from './preview.tsx';

function TokenField({
  token,
  value,
  bad,
  onChange,
}: {
  token: ThemeToken;
  value: string;
  bad: boolean;
  onChange: (value: string) => void;
}) {
  const label = tokenLabel(token);
  return (
    <FieldControl label={label} error={bad ? t('themes.badHex') : undefined}>
      {(props) => (
        <div className="flex gap-2">
          <input
            type="color"
            aria-label={t('themes.picker', { token: label })}
            value={pickerValue(value)}
            onChange={(e) => {
              onChange(e.currentTarget.value);
            }}
            className="h-11 w-14 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
          />
          <Input
            {...props}
            name={token}
            value={value}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            maxLength={7}
            className="h-11 font-mono text-base"
            onChange={(e) => {
              onChange(e.currentTarget.value.trim());
            }}
          />
        </div>
      )}
    </FieldControl>
  );
}

function ContrastPanel({ check }: { check: DraftCheck }) {
  const headingId = useId();
  let summary: string;
  if (check.badTokens.length > 0) summary = t('themes.fixColours');
  else if (check.failures.length > 0)
    summary = t('themes.failing', { count: check.failures.length });
  else summary = t('themes.allPass', { count: check.pairs.length });
  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h2 id={headingId} className="text-lg font-semibold">
        {t('themes.contrast')}
      </h2>
      {/* Only the summary is announced, not every pair on every change. */}
      <p aria-live="polite" className="sr-only">
        {summary}
      </p>
      <p
        data-testid="contrast-summary"
        className={
          check.failures.length > 0 || check.badTokens.length > 0
            ? 'mt-2 font-medium text-over'
            : 'mt-2 text-positive'
        }
      >
        {summary}
      </p>
      {check.failures.length > 0 ? (
        <ul
          data-testid="contrast-failures"
          className="mt-2 list-disc pl-5 text-sm"
        >
          {check.failures.map((failure) => (
            <li key={pairKey(failure)}>{pairText(failure)}</li>
          ))}
        </ul>
      ) : null}
      {check.pairs.length > 0 ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {t('themes.allPairs')}
          </summary>
          <ul className="mt-2 grid gap-1">
            {check.pairs.map((pair) => (
              <li key={pairKey(pair)} className="flex justify-between gap-4">
                <span>
                  {tokenLabel(pair.foreground)} / {surfaceLabel(pair)}
                </span>
                <span className="font-mono">
                  {formatContrastRatio(pair.ratio)}:1{' '}
                  {pair.ratio >= pair.required
                    ? t('themes.passes')
                    : t('themes.fails')}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/**
 * Creates a theme (`editing` undefined) or changes one. `starts` lists the
 * themes a new one can start from.
 */
export function ThemeEditor({
  userId,
  initial,
  editing,
  starts,
  startId,
}: {
  userId: string;
  initial: ThemeDraft;
  editing?: CustomTheme | undefined;
  starts: readonly NamedTheme[];
  startId?: string | undefined;
}) {
  const [draft, setDraft] = useState(initial);
  const [start, setStart] = useState(startId ?? '');
  const [attempted, setAttempted] = useState(false);
  const check = checkDraft(draft);
  const { setSlot } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const userQuery = themesQuery(userId);
  const save = useMutation({
    mutationFn: (body: ThemeBody) =>
      editing === undefined ? createTheme(body) : updateTheme(editing.id, body),
    onSuccess: async () => {
      // A scheme change can move the theme out of its slot on the server.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: userQuery.queryKey }),
        queryClient.invalidateQueries({
          queryKey: appearanceQuery(userId).queryKey,
        }),
      ]);
    },
  });
  const problem = save.isError ? describeProblem(save.error) : null;

  function setToken(token: ThemeToken, value: string) {
    setDraft((current) => ({
      ...current,
      tokens: { ...current.tokens, [token]: value },
    }));
    if (save.isError) save.reset();
  }

  // Saving is refused here, not by disabling the buttons, so the reason is
  // given where the person looks.
  function submit(use: boolean) {
    setAttempted(true);
    if (check.body === null) return;
    save.mutate(check.body, {
      onSuccess: (theme) => {
        if (use) setSlot(theme.scheme, theme.id);
        void navigate({ to: '/settings', hash: 'appearance' });
      },
    });
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(false);
  }

  let blocked: string | null = null;
  if (attempted && check.body === null)
    blocked =
      check.badTokens.length > 0 || check.failures.length > 0
        ? t('themes.fixFirst')
        : t('themes.nameRequired');

  const busy = save.isPending;
  const schemeName = useId();

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]"
    >
      <div className="grid content-start gap-6">
        <FieldControl
          label={t('themes.name')}
          error={
            attempted && check.nameError ? t('themes.nameRequired') : undefined
          }
        >
          {(props) => (
            <Input
              {...props}
              name="name"
              value={draft.name}
              maxLength={40}
              autoComplete="off"
              className="h-11 text-base"
              onChange={(e) => {
                const name = e.currentTarget.value;
                setDraft((current) => ({ ...current, name }));
                if (save.isError) save.reset();
              }}
            />
          )}
        </FieldControl>
        {editing === undefined ? (
          <div className="grid gap-2">
            <Label htmlFor={`${schemeName}-start`}>
              {t('themes.startFrom')}
            </Label>
            <select
              id={`${schemeName}-start`}
              className={selectClass}
              value={start}
              onChange={(e) => {
                const id = e.currentTarget.value;
                const theme = starts.find((s) => s.id === id);
                setStart(id);
                if (theme !== undefined)
                  setDraft((current) => draftFrom(theme, current.name));
              }}
            >
              {starts.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name} ({t(`themes.schemes.${theme.scheme}`)})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <fieldset>
          <legend className="text-sm font-medium">{t('themes.scheme')}</legend>
          <div className="mt-2 flex gap-6">
            {THEME_SCHEMES.map((scheme) => (
              <label key={scheme} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={schemeName}
                  value={scheme}
                  checked={draft.scheme === scheme}
                  onChange={() => {
                    setDraft((current) => ({ ...current, scheme }));
                  }}
                  className="size-4 accent-primary"
                />
                {t(`themes.schemes.${scheme}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {TOKEN_GROUPS.map(([group, tokens]) => (
          <fieldset key={group} className="grid gap-4">
            <legend className="mb-2 text-lg font-semibold">
              {t(`themes.groups.${group}`)}
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {tokens.map((token) => (
                <TokenField
                  key={token}
                  token={token}
                  value={draft.tokens[token]}
                  bad={check.badTokens.includes(token)}
                  onChange={(value) => {
                    setToken(token, value);
                  }}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="grid content-start gap-2 lg:sticky lg:top-6 lg:self-start">
        <h2 className="text-lg font-semibold">{t('themes.preview')}</h2>
        <ThemePreview tokens={draft.tokens} />
        <ContrastPanel check={check} />
        <FormError message={problem?.message ?? blocked} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" className="h-11" disabled={busy}>
            {busy ? t('themes.saving') : t('themes.save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => {
              submit(true);
            }}
          >
            {t('themes.saveAndUse')}
          </Button>
          <Button asChild variant="ghost" className="h-11">
            <Link to="/settings" hash="appearance">
              {t('themes.cancel')}
            </Link>
          </Button>
        </div>
      </div>
    </form>
  );
}
