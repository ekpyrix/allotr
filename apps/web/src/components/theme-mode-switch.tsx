import { THEME_MODES, type ThemeMode } from '@allotr/shared';
import { cn } from '@/lib/utils';
import { useThemeMode } from './theme-provider.tsx';

const labels: Readonly<Record<ThemeMode, string>> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

// Native radios: arrow keys move between modes and screen readers announce
// the group as "Theme".
export function ThemeModeSwitch({ className }: { className?: string }) {
  const { mode, setMode, saveError } = useThemeMode();
  return (
    <fieldset className={cn('text-sm', className)}>
      <legend className="sr-only">Theme</legend>
      <div className="inline-flex rounded-md border border-input p-0.5">
        {THEME_MODES.map((option) => (
          <label
            key={option}
            className="cursor-pointer rounded-sm px-2.5 py-1 text-muted-foreground transition-colors duration-(--duration-fast) has-checked:bg-plot has-checked:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring"
          >
            <input
              type="radio"
              name="theme-mode"
              value={option}
              checked={mode === option}
              onChange={() => {
                setMode(option);
              }}
              className="sr-only"
            />
            {labels[option]}
          </label>
        ))}
      </div>
      {saveError ? (
        <p role="status" className="mt-1 text-over">
          Theme not saved to your account. It still applies on this device.
        </p>
      ) : null}
    </fieldset>
  );
}
