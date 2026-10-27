import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { DEFAULT_THEME, themeById, type Theme, type Tokens } from './themes';

export type Mode = 'light' | 'dark';
export type Lang = 'en' | 'hi';

type Ctx = {
  theme: Theme;
  mode: Mode;
  tokens: Tokens;
  lang: Lang;
  level: number;
  setTheme: (id: string, from?: { x: number; y: number }) => void;
  toggleMode: (from?: { x: number; y: number }) => void;
  setLang: (l: Lang) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

// Per-viewer conveniences only. The real profile lives in the backend.
function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window: keep it in memory only */
  }
}

function prefersDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function apply(tokens: Tokens, theme: Theme, mode: Mode) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(`--${k}`, v);
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.dark ? mode : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.bg);
}

// Circle reveal from the tapped point, where the browser supports view transitions.
function withReveal(change: () => void, from?: { x: number; y: number }) {
  type VT = { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  const doc = document as unknown as VT;
  // No reveal when the page is hidden (the browser would hold the change until it draws again).
  if (!doc.startViewTransition || reducedMotion() || document.visibilityState !== 'visible' || new URLSearchParams(location.search).has('instant')) {
    change();
    return;
  }
  const x = from?.x ?? innerWidth / 2;
  const y = from?.y ?? 0;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const t = doc.startViewTransition(change);
  t.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState(() => load('dishaara.theme') ?? DEFAULT_THEME);
  const [mode, setMode] = useState<Mode>(() => (load('dishaara.mode') as Mode | null) ?? (prefersDark() ? 'dark' : 'light'));
  const [lang, setLangState] = useState<Lang>(() => (load('dishaara.lang') as Lang | null) ?? 'en');
  const level = 1; // demo profile

  const theme = themeById(themeId);
  const tokens = theme.dark && mode === 'dark' ? theme.dark : theme.light;

  // Layout effect so the new colours are on the page before the view transition snapshots it.
  useLayoutEffect(() => apply(tokens, theme, mode), [tokens, theme, mode]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setTheme = useCallback((id: string, from?: { x: number; y: number }) => {
    withReveal(() => {
      flushSync(() => setThemeId(id));
      save('dishaara.theme', id);
    }, from);
  }, []);

  const toggleMode = useCallback((from?: { x: number; y: number }) => {
    withReveal(() => {
      flushSync(() =>
        setMode((m) => {
          const next = m === 'dark' ? 'light' : 'dark';
          save('dishaara.mode', next);
          return next;
        }),
      );
    }, from);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    save('dishaara.lang', l);
  }, []);

  const value = useMemo(
    () => ({ theme, mode, tokens, lang, level, setTheme, toggleMode, setLang }),
    [theme, mode, tokens, lang, setTheme, toggleMode, setLang],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error('useTheme outside ThemeProvider');
  return c;
}
