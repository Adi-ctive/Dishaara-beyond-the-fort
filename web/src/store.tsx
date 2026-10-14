import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_PROFILE, SEED, runFreshness, withGuardrails, type Counts, type Guardrail, type Lang, type Profile } from './core';
import { makeT } from './i18n';

// App state. Everything personal stays in this browser (DPDP: no location history, nothing sent out).

export interface SavedPlan { id: string; date: string; places: string[]; at: string }
export interface Report { id: string; placeId: string; field: string; text: string; at: string }
export interface LogEntry { at: string; placeId: string; change: string }

const today = () => {
  const d = new Date(Date.now() + 5.5 * 3600000); // IST
  return d.toISOString().slice(0, 10);
};

function load<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem('dishaara.' + k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function usePersist<T>(k: string, init: T) {
  const [v, set] = useState<T>(() => load(k, init));
  useEffect(() => { try { localStorage.setItem('dishaara.' + k, JSON.stringify(v)); } catch { /* storage blocked */ } }, [k, v]);
  return [v, set] as const;
}

function useApp() {
  const [lang, setLang] = usePersist<Lang>('lang', 'en');
  const [user, setUser] = usePersist<{ name: string } | null>('user', null);
  const [profile, setProfile] = usePersist<Profile | null>('profile', null);
  const [plans, setPlans] = usePersist<SavedPlan[]>('plans', []);
  const [reports, setReports] = usePersist<Report[]>('reports', []);
  const [overrides, setOverrides] = usePersist<Record<string, Partial<Guardrail>>>('guardrails', {});
  const [log, setLog] = usePersist<LogEntry[]>('guardrailLog', []);
  const [asOf, setAsOf] = useState(today());

  const { data, queue } = useMemo(() => runFreshness(withGuardrails(SEED, overrides), asOf), [overrides, asOf]);
  const counts = useMemo(() => {
    const c: Counts = {};
    for (const p of plans) for (const id of new Set(p.places)) { c[p.date] ??= {}; c[p.date][id] = (c[p.date][id] ?? 0) + 1; }
    return c;
  }, [plans]);
  const tr = useMemo(() => makeT(lang), [lang]);
  useEffect(() => { document.documentElement.lang = lang === 'en' ? 'en' : 'hi'; }, [lang]);

  return {
    ...tr, setLang, today: today(), asOf, setAsOf, data, queue, counts,
    user, setUser, profile: profile ?? { ...DEFAULT_PROFILE, lang }, hasProfile: !!profile, setProfile,
    plans, savePlan: (p: Omit<SavedPlan, 'id' | 'at'>) => setPlans([...plans, { ...p, id: crypto.randomUUID(), at: new Date().toISOString() }]),
    reports, addReport: (r: Omit<Report, 'id' | 'at'>) => setReports([...reports, { ...r, id: crypto.randomUUID(), at: new Date().toISOString() }]),
    overrides, setGuardrail: (placeId: string, g: Partial<Guardrail>, change: string) => {
      setOverrides({ ...overrides, [placeId]: { ...overrides[placeId], ...g } });
      setLog([{ at: new Date().toISOString(), placeId, change }, ...log]);
    },
    log,
  };
}

export type App = ReturnType<typeof useApp>;
const Ctx = createContext<App | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  return <Ctx.Provider value={app}>{children}</Ctx.Provider>;
}
export const useA = () => useContext(Ctx)!;

export function useRoute() {
  const [hash, setHash] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => { setHash(location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}
