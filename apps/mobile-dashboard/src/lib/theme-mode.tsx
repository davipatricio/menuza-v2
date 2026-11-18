import Storage from "expo-sqlite/kv-store";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { Uniwind, useUniwind } from "uniwind";

/** The operator's choice: follow the device, or pin one of the two palettes. */
export type ThemeMode = "system" | "light" | "dark";

const THEME_KEY = "menuza.dashboard.theme";

interface ThemeModeState {
  mode: ThemeMode;
  /** The palette actually painted right now, after the system resolves. */
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeState | null>(null);

export function useThemeMode(): ThemeModeState {
  const value = use(ThemeModeContext);

  if (!value) throw new Error("useThemeMode was called outside ThemeModeProvider");

  return value;
}

/**
 * Dashboard palette selection.
 *
 * `Uniwind.setTheme` also calls `Appearance.setColorScheme`, so the native
 * header, tab bar and keyboard follow the same choice as the JS surfaces. The
 * choice is stored in SQLite and applied before the first paint of the tabs.
 */
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const { theme } = useUniwind();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    void Storage.getItem(THEME_KEY).then((saved) => {
      if (saved !== "light" && saved !== "dark" && saved !== "system") return;

      setModeState(saved);
      Uniwind.setTheme(saved);
    });
  }, []);

  function setMode(next: ThemeMode) {
    setModeState(next);
    Uniwind.setTheme(next);
    void Storage.setItem(THEME_KEY, next);
  }

  return (
    <ThemeModeContext value={{ mode, resolved: theme === "dark" ? "dark" : "light", setMode }}>
      {children}
    </ThemeModeContext>
  );
}
