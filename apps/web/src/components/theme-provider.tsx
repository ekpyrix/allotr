import {
  DEFAULT_APPEARANCE,
  type Appearance,
  type AppearanceBody,
  type CustomTheme,
  type ThemeMode,
  type ThemeScheme,
} from '@allotr/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { appearanceQuery, saveAppearance, themesQuery } from '@/lib/appearance';
import { sessionQuery } from '@/lib/session';
import {
  applyScheme,
  cacheMode,
  cacheTokens,
  readCachedMode,
  readCachedTokens,
  resolveScheme,
  slotTokens,
} from '@/lib/theme-mode';

// Owns the theme for the whole app. Signed out, it is the mode and colours
// cached on this device (the ones theme-init.js already applied); signed
// in, the account's copy wins. `system` follows the device while the page
// is open.

type ThemeState = Readonly<{
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** The account's settings; the defaults while signed out or loading. */
  appearance: Appearance;
  /** Picks the theme for a scheme; ignored while signed out. */
  setSlot: (scheme: ThemeScheme, id: string) => void;
  /** Undefined until loaded, or while signed out. */
  customThemes: readonly CustomTheme[] | undefined;
  saveError: boolean;
}>;

const ThemeContext = createContext<ThemeState | null>(null);

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
  const [deviceTokens] = useState(() => readCachedTokens(deviceStorage()));
  const { data: session } = useQuery(sessionQuery);
  const userId = session?.user.id;
  const signedIn = userId !== undefined;
  const account = appearanceQuery(userId ?? '');
  const { data: stored } = useQuery({ ...account, enabled: signedIn });
  const { data: customThemes } = useQuery({
    ...themesQuery(userId ?? ''),
    enabled: signedIn,
  });
  const mode = signedIn && stored ? stored.mode : deviceMode;
  const appearance = signedIn && stored ? stored : DEFAULT_APPEARANCE;
  // Until the account's themes load, keep the colours already painted.
  const tokens = useMemo(
    () =>
      signedIn && stored && customThemes
        ? slotTokens(stored, customThemes)
        : deviceTokens,
    [signedIn, stored, customThemes, deviceTokens],
  );
  // The user whose last save failed, so the message goes with the account.
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const saveError = signedIn && failedFor === userId;

  useEffect(() => {
    const storage = deviceStorage();
    cacheMode(storage, mode);
    cacheTokens(storage, tokens);
    const media = window.matchMedia(darkQuery);
    const apply = () => {
      const scheme = resolveScheme(mode, media.matches);
      applyScheme(document, scheme, tokens[scheme]);
    };
    apply();
    if (mode !== 'system') return;
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
    };
  }, [mode, tokens]);

  const saves = useRef(0);

  // Only the change is sent: before the account's settings load, the
  // defaults here must not overwrite its slots. The reply is the truth.
  function save(change: AppearanceBody) {
    setDeviceMode(change.mode);
    setFailedFor(null);
    if (userId === undefined) return;
    if (stored)
      queryClient.setQueryData(account.queryKey, {
        mode: change.mode,
        light: change.light ?? stored.light,
        dark: change.dark ?? stored.dark,
      });
    const attempt = ++saves.current;
    saveAppearance(change)
      .then((saved) => {
        // An older reply must not undo a newer choice.
        if (attempt === saves.current)
          queryClient.setQueryData(account.queryKey, saved);
      })
      .catch(() => {
        // The choice still applies on this device.
        setFailedFor(userId);
      });
  }

  function setSlot(scheme: ThemeScheme, id: string) {
    save({ mode, [scheme]: id });
  }

  function setMode(next: ThemeMode) {
    save({ mode: next });
  }

  return (
    <ThemeContext
      value={{
        mode,
        setMode,
        appearance,
        setSlot,
        customThemes: signedIn ? customThemes : undefined,
        saveError,
      }}
    >
      {children}
    </ThemeContext>
  );
}

export function useTheme(): ThemeState {
  const state = use(ThemeContext);
  if (state === null) throw new Error('useTheme needs a ThemeProvider');
  return state;
}
