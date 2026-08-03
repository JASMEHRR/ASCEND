import { createContext, useContext, useEffect, type ReactNode } from 'react';

export type Theme = 'dark';

interface ThemeValue {
  theme: Theme;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Ascend is dark-only. Light mode was removed — the atmospheres and liquid
 * glass are built for a near-black command centre, and the light overrides in
 * index.css never carried their weight. This provider just pins the attribute
 * so any remaining [data-theme] selectors resolve predictably.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    try {
      localStorage.removeItem('ascend_theme');
    } catch {
      /* private mode */
    }
  }, []);

  return <ThemeContext.Provider value={{ theme: 'dark' }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a <ThemeProvider>');
  return ctx;
}
