import { cn } from '@/lib/utils';

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
        <rect
          x="1"
          y="1"
          width="12"
          height="22"
          rx="1.5"
          className="fill-foreground"
        />
        <rect
          x="15"
          y="1"
          width="8"
          height="10"
          rx="1.5"
          className="fill-today"
        />
        <rect
          x="15"
          y="13"
          width="8"
          height="10"
          rx="1.5"
          className="fill-foreground"
        />
      </svg>
      <span className="text-lg font-semibold tracking-tight">Allotr</span>
    </div>
  );
}
