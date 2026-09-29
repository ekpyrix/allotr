import { useId } from 'react';
import { useQuickEntry } from '@/features/quick-entry/quick-entry-provider';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';

export function ShortcutsSwitch({ className }: { className?: string }) {
  const { shortcutsEnabled, setShortcutsEnabled } = useQuickEntry();
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        id={id}
        type="checkbox"
        checked={shortcutsEnabled}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          setShortcutsEnabled(e.currentTarget.checked);
        }}
        className="mt-1 size-4 accent-primary"
      />
      <div>
        <label htmlFor={id} className="font-medium">
          {t('settings.shortcuts')}
        </label>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {t('settings.shortcutsHint')}
        </p>
      </div>
    </div>
  );
}
