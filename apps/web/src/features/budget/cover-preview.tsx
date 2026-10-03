import {
  formatMoney,
  type CoverPreviewBody,
  type CoverPreviewView,
  type CreateTransactionBody,
} from '@allotr/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { previewCover } from '@/lib/budgets';
import { t } from '@/messages/t';

/** The cover request for an entry, or null when it is not a plain expense. */
export function coverRequest(
  body: CreateTransactionBody | null,
): CoverPreviewBody | null {
  if (body?.kind !== 'expense' || body.lines !== undefined) return null;
  if (body.categoryId === undefined || body.amount.amountMinor <= 0)
    return null;
  return {
    accountId: body.accountId,
    amount: body.amount,
    categoryId: body.categoryId,
    ...(body.tagIds === undefined ? {} : { tagIds: body.tagIds }),
    ...(body.occurredOn === undefined ? {} : { occurredOn: body.occurredOn }),
  };
}

export function coverKey(request: CoverPreviewBody | null): string | null {
  return request === null ? null : JSON.stringify(request);
}

export const coverPreviewOptions = (request: CoverPreviewBody) => ({
  queryKey: ['today', 'budgets', 'cover-preview', coverKey(request)],
  queryFn: () => previewCover(request),
  staleTime: 10_000,
  // The preview is advice: offline or failing, saving must not wait on retries.
  retry: false,
  networkMode: 'always' as const,
});

/**
 * The server's cover for what is typed, settled for 300 ms so it does not
 * ask on every key. `key` is the request it answers, so a caller can tell
 * whether the preview matches what is on screen.
 */
export function useCoverPreview(request: CoverPreviewBody | null) {
  const key = coverKey(request);
  const [settled, setSettled] = useState<CoverPreviewBody | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      setSettled(request);
    }, 300);
    return () => {
      clearTimeout(id);
    };
    // The key stands for the request's content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const query = useQuery({
    ...coverPreviewOptions(settled ?? (request as CoverPreviewBody)),
    enabled: settled !== null,
    placeholderData: keepPreviousData,
  });
  return {
    preview: settled === null ? undefined : query.data,
    key: coverKey(settled),
  };
}

/** What the entry would take from where, in the warning colour. */
export function CoverPreview({
  preview,
  locale,
}: {
  preview: CoverPreviewView;
  locale: string;
}) {
  if (!preview.counted) return null;
  const covers = preview.covers.filter((c) => c.amount.amountMinor > 0);
  const quiet = covers.length === 0 && preview.uncovered.amountMinor === 0;
  if (quiet) return null;
  const warn = preview.needsConfirmation || preview.uncovered.amountMinor > 0;
  return (
    <section
      aria-label={t('budget.preview.label')}
      className={`grid gap-1 rounded-md p-3 text-body text-text ${warn ? 'bg-warning-container' : 'border border-outline-variant'}`}
    >
      <div className="flex gap-2">
        {warn ? (
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0"
          />
        ) : null}
        <div className="grid gap-1">
          {covers.map((c) => (
            <p key={c.source}>
              {t('budget.preview.takes', {
                amount: formatMoney(c.amount, locale),
                source: c.source === 'free' ? t('budget.cover.free') : c.name,
              })}
            </p>
          ))}
          {preview.uncovered.amountMinor > 0 ? (
            <p>
              {t('budget.preview.uncovered', {
                amount: formatMoney(preview.uncovered, locale),
              })}
            </p>
          ) : null}
          {preview.needsConfirmation ? (
            <p className="font-medium">{t('budget.preview.setAside')}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
