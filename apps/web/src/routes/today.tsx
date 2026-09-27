import type { SessionUser } from '@allotr/shared';
import { t } from '@/messages/t';

// Placeholder figures until the Today view (#59).
export function TodayPage({ user }: { user: SessionUser }) {
  return (
    <>
      <h1 className="text-lg font-medium text-muted-foreground">
        {t('today.title')}
      </h1>
      <p
        className="mt-1 text-8xl leading-[0.75] font-semibold tracking-tighter text-today sm:text-9xl"
        aria-label={t('today.noFigure')}
      >
        —
      </p>
      <p className="mt-6 max-w-prose text-lg">
        {t('today.greeting', { name: user.name })}
      </p>
      <section
        aria-label={t('today.moneyLabel')}
        className="mt-12 grid gap-3 sm:grid-cols-[2fr_1fr]"
      >
        <div className="min-h-36 rounded-md bg-plot p-5">
          <h2 className="font-medium">{t('today.spendable')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('today.spendableHint')}
          </p>
        </div>
        <div className="min-h-36 rounded-md border-2 border-dashed border-input p-5">
          <h2 className="font-medium">{t('today.bills')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('today.billsHint')}
          </p>
        </div>
      </section>
    </>
  );
}
