import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppTheme = "default" | "pickme" | "ultra-dark";

type ThemeContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
};

const THEME_STORAGE_KEY = "djhub_theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

const isAppTheme = (value: string | null): value is AppTheme =>
  value === "default" || value === "pickme" || value === "ultra-dark";

const getStoredTheme = (): AppTheme => {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isAppTheme(stored) ? stored : "default";
};

const applyTheme = (theme: AppTheme) => {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    const initialTheme = getStoredTheme();
    applyTheme(initialTheme);
    return initialTheme;
  });

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: setThemeState,
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};
