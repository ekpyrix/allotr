import { Skeleton, SkeletonCard, SkeletonRows } from '@/components/ui/skeleton';
import { t } from '@/messages/t';

// What a route shows while its code or data loads (ADR 0022): shapes the
// page will fill, never a spinner. It is a status region so the wait is
// announced once.
export function RouteSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4 pt-4">
      <p className="sr-only">{t('ui.loading')}</p>
      <Skeleton className="h-8 w-40" />
      <SkeletonCard />
      <SkeletonRows rows={5} />
    </div>
  );
}

/** A page body loading: announces `label`, shows card and row shapes. */
export function LoadingBlock({
  label,
  rows = 4,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <div role="status" aria-busy="true" className="mt-6 grid gap-4">
      <p className="sr-only">{label}</p>
      <SkeletonCard />
      <SkeletonRows rows={rows} />
    </div>
  );
}
