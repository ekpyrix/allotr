import {
  type CoverPreviewBody,
  type CreateTransactionBody,
} from '@allotr/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { previewCover } from '@/lib/budgets';

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
