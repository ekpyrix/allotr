import type { ThemeMode } from '@allotr/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { appearanceQuery, saveAppearance } from '@/lib/appearance';
import { sessionQuery } from '@/lib/session';
import {
  applyScheme,
  cacheMode,
  readCachedMode,
  resolveScheme,
} from '@/lib/theme-mode';

// Owns the theme mode for the whole app. Signed out, it is the mode cached
// on this device (the one theme-init.js already applied); signed in, the
// account's copy wins. `system` follows the device while the page is open.

type ThemeModeState = Readonly<{
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  saveError: boolean;
}>;

const ThemeModeContext = createContext<ThemeModeState | null>(null);

const darkQuery = '(prefers-color-scheme: dark)';

function deviceStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [deviceMode, setDeviceMode] = useState(() =>
    readCachedMode(deviceStorage()),
  );
  const [saveError, setSaveError] = useState(false);
  const { data: session } = useQuery(sessionQuery);
  const signedIn = session !== null && session !== undefined;
  const { data: stored } = useQuery({ ...appearanceQuery, enabled: signedIn });
  const mode = signedIn && stored !== undefined ? stored.mode : deviceMode;

  useEffect(() => {
    cacheMode(deviceStorage(), mode);
    const media = window.matchMedia(darkQuery);
    const apply = () => {
      applyScheme(document, resolveScheme(mode, media.matches));
    };
    apply();
    if (mode !== 'system') return;
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
    };
  }, [mode]);

  function setMode(next: ThemeMode) {
    setDeviceMode(next);
    setSaveError(false);
    if (!signedIn) return;
    queryClient.setQueryData(appearanceQuery.queryKey, { mode: next });
    saveAppearance(next).catch(() => {
      // The choice still applies on this device.
      setSaveError(true);
    });
  }

  return (
    <ThemeModeContext value={{ mode, setMode, saveError }}>
      {children}
    </ThemeModeContext>
  );
}

export function useThemeMode(): ThemeModeState {
  const state = use(ThemeModeContext);
  if (state === null) throw new Error('useThemeMode needs a ThemeProvider');
  return state;
}
