// App state. Accounts, points, posts, quests, stamps and plans live on the server (docs/API.md);
// this keeps the signed-in session, the current trip and display choices in the browser.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  SEEDS, cityNear, buildPlan, runFreshness, timeSequence, allUnits, DEFAULT_PROFILE,
  type CityId, type Data, type Mode, type Plan, type PlanInput, type Profile, type Counts,
} from './core';
import { likesFor, type Ticket } from './data/demo';
import { api, apiOn, type Me } from './api';
type Post = { id: string; by: string; kind: string; place: string; en: string; hi: string; likes: number; comments: number; ago: string };

export type Role = 'raahi' | 'saarthi' | 'business' | 'moderator';
export type Stamp = { at: string; status: 'confirmed' | 'pending'; quiet: boolean; rare: boolean };
export type Prefs = {
  pace: Profile['pace']; walking: Profile['walking']; budget: Profile['budget']; maxPerPlace: number; worship: boolean; autoVoice: boolean; location: boolean; // autoVoice: read every reply aloud (off unless they turn it on)
  // Who is coming: counts drive ticket prices (children and visitors from abroad pay differently).
  who: 'solo' | 'couple' | 'family' | 'friends'; group: { indian: number; foreign: number; child: number }; elders: boolean;
  modes: Mode[]; // how they get around
  payment: 'cash' | 'online'; // ASI tickets cost less online
  food: 'any' | 'veg' | 'street';
  startAt: 'now' | 'early' | 'mid' | 'after'; // when the day starts
  night: boolean; // happy to be out after dark (night markets)
  access: boolean; // uses a wheelchair or avoids stairs
  note: string; // anything else, in their words (sent to the chat model, religion lines are dropped)
};
export type Twists = { closed: string[]; crowded?: string[]; budgetHalf: boolean; rain: boolean; festival: boolean };
export type QuickInput = { hours: number; startPoint: string; start: string };

export type State = {
  city: CityId; // plans, map and chat follow this city
  role: Role;
  signedIn: boolean;
  user: Me | null; // the server account when a backend is connected
  onboarded: boolean;
  interests: string[];
  prefs: Prefs;
  prompt: string[];
  quick: QuickInput | null;
  order: string[] | null; // unit ids in the raahi's own order
  done: string[]; // unit ids ticked
  skip: string[]; // unit ids already visited, left out when the day is replanned
  removed: string[]; // unit ids the raahi took out of the roadmap; the planner never puts them back
  awarded: string[]; // points already given (tick:<unit>, visit:<biz>:<date>, still:<place>:<date>) so taps cannot farm points
  added: string[]; // place ids the raahi added by name
  stamps: Record<string, Stamp>;
  points: number;
  feedback: number;
  facts: number;
  food: number;
  tickets: Ticket[];
  stillTrue: Record<string, { yes: number; no: number }>;
  testMode: boolean;
  testAt: string | null;
  twists: Twists;
  history: { date: string; places: string[] }[];
  look: { avatar: string; frame: string; banner: string };
  seenLevel: number; // highest level already celebrated
  liked: string[];
  saved: string[];
  following: string[];
  myPosts: Post[];
  myComments: Record<string, string[]>; // business id -> comments this raahi wrote
  mapFocus: string | null; // place or business id to show when the map opens
  saarthiPlace: string | null; // place a saarthi tapped on their home, opened in the form
  saarthiApproved: number; // this saarthi's approved entries (unlocks the senior frame)
};

/** Give points once per key. Returns the state patch (empty when already given). */
export function award(c: State, key: string, pts: number): Partial<State> {
  // Guests plan trips but earn nothing: points belong to an account.
  return !c.signedIn || c.awarded.includes(key) ? {} : { points: c.points + pts, awarded: [...c.awarded, key] };
}

const INITIAL: State = {
  city: 'gwalior',
  role: 'raahi',
  signedIn: false,
  user: null,
  onboarded: false,
  interests: [],
  prefs: { pace: 'normal', walking: 'medium', budget: 'medium', maxPerPlace: 60, worship: true, autoVoice: false, location: false,
    who: 'solo', group: { indian: 1, foreign: 0, child: 0 }, elders: false, modes: ['walk', 'auto'], payment: 'cash', food: 'any', startAt: 'now', night: false, access: false, note: '' },
  prompt: [],
  quick: null,
  order: null,
  done: [],
  skip: [],
  removed: [],
  awarded: [],
  added: [],
  stamps: {},
  points: 0,
  feedback: 0,
  facts: 0,
  food: 0,
  tickets: [],
  stillTrue: {},
  testMode: false,
  testAt: null,
  twists: { closed: [], crowded: [], budgetHalf: false, rain: false, festival: false },
  history: [],
  look: { avatar: 'peacock', frame: 'none', banner: 'dusk' },
  seenLevel: 1,
  liked: [],
  saved: [],
  following: [],
  myPosts: [],
  myComments: {},
  mapFocus: null,
  saarthiPlace: null,
  saarthiApproved: 0,
};

const KEY = 'dishaara.state.v1';
function load(): State {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return INITIAL;
    const saved = JSON.parse(s);
    // Older saves lack the newer preferences: fill them from the defaults.
    return { ...INITIAL, ...saved, prefs: { ...INITIAL.prefs, ...saved.prefs } };
  } catch {
    return INITIAL;
  }
}

// IST date, so the plan uses the visitor's local day.
export const todayIST = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
export const nowMinIST = () => {
  const d = new Date(Date.now() + 5.5 * 3600000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

export const levelOf = (points: number) => 1 + Math.floor(points / 100);

// The personal prompt lines the chat model receives, rebuilt from answers. The raahi can edit them.
export function promptFrom(interests: string[], p: Prefs): string[] {
  const lines = interests.length ? [`Likes: ${interests.join(', ')}`] : [];
  lines.push(p.pace === 'relaxed' ? 'Likes a slow pace' : p.pace === 'fast' ? 'Likes to see a lot quickly' : 'Normal pace');
  lines.push(`Does not want more than ${p.maxPerPlace} minutes at one place`);
  if (!p.worship) lines.push('Does not want places of worship suggested');
  if (p.walking === 'low') lines.push('Prefers little walking');
  const g = p.group;
  lines.push(p.who === 'solo' ? 'Travelling alone' : `Travelling as ${p.who}: ${g.indian + g.foreign} adult(s)${g.child ? `, ${g.child} child(ren)` : ''}${g.foreign ? `, ${g.foreign} visiting from abroad` : ''}`);
  if (p.elders) lines.push('Travelling with elders: keep walks and climbs short');
  if (p.access) lines.push('Uses a wheelchair or avoids stairs: say plainly when access is not known');
  if (p.food === 'veg') lines.push('Eats vegetarian food only');
  if (p.food === 'street') lines.push('Loves street food');
  if (p.night) lines.push('Happy to be out after dark');
  lines.push(`Gets around by ${p.modes.join(', ')}; pays by ${p.payment === 'online' ? 'UPI or card' : 'cash'}`);
  if (p.note.trim()) lines.push(p.note.trim().slice(0, 200));
  return lines;
}

type Ctx = {
  s: State;
  set: (patch: Partial<State> | ((s: State) => Partial<State>)) => void;
  data: Data;
  today: string;
  profile: Profile;
  plan: Plan | null;
  level: number;
  counts: Counts;
  reset: () => void;
  setCity: (c: CityId) => void;
};

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(load);
  const today = todayIST();

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* storage blocked: state stays in memory */
    }
  }, [s]);

  // With a backend: twists set on the moderator's device reach every raahi within seconds,
  // and profile answers are saved on the server.
  useEffect(() => {
    if (!apiOn()) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    // Every 5 s while the server answers; every 30 s after a failure (weak signal at a fort).
    const pull = async () => {
      const t = await api.getTwists();
      if (!alive) return;
      if (t)
        setS((cur) => {
          const { testMode, ...tw } = t;
          if (JSON.stringify(tw) === JSON.stringify(cur.twists) && testMode === cur.testMode) return cur;
          return { ...cur, twists: tw, testMode, order: null };
        });
      timer = setTimeout(pull, t ? 5000 : 30000);
    };
    pull();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  // The chosen look belongs to the account, so others see it (saarthi pages, leaderboard).
  useEffect(() => {
    if (!apiOn() || !s.signedIn) return;
    const id = setTimeout(() => api.putProfile({ avatar: s.look.avatar, frame: s.look.frame, banner: s.look.banner }), 800);
    return () => clearTimeout(id);
  }, [s.signedIn, s.look.avatar, s.look.frame, s.look.banner]);
  useEffect(() => {
    if (!apiOn() || !s.onboarded) return;
    const id = setTimeout(() => api.putProfile({ interests: s.interests, prefs: s.prefs, prompt: s.prompt }), 800);
    return () => clearTimeout(id);
  }, [s.onboarded, s.interests, s.prefs, s.prompt]);

  // Restore the server session on load; a ban or expiry signs the raahi out.
  useEffect(() => {
    if (!apiOn()) return;
    api.me().then((u) => {
      setS((cur) => {
        if (u) return { ...cur, signedIn: true, user: u, points: u.points ?? cur.points };
        if (cur.user) return { ...cur, signedIn: false, user: null, role: 'raahi', stamps: {}, points: 0 };
        return cur;
      });
    });
  }, []);
  // Stamps and points belong to the account: load them from the server whenever someone signs in.
  useEffect(() => {
    if (!apiOn() || !s.signedIn) return;
    api.myStamps().then((m) => {
      if (!m) return;
      const stamps: Record<string, Stamp> = {};
      for (const [id, x] of Object.entries(m)) stamps[id] = { at: new Date(x.t * 1000).toISOString(), status: x.status, quiet: x.quiet, rare: x.rarity === 'rare' };
      setS((cur) => ({ ...cur, stamps }));
    });
    api.progress().then((p) => p && setS((cur) => ({ ...cur, points: p.points, feedback: p.feedback, food: p.food })));
    if (s.user?.roles.includes('saarthi')) api.saarthiMe().then((m) => m && setS((cur) => ({ ...cur, saarthiApproved: m.approved })));
  }, [s.signedIn]);

  const set = useCallback((patch: Partial<State> | ((s: State) => Partial<State>)) => {
    setS((cur) => ({ ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) }));
  }, []);

  // Place data comes from the server (the database holds saarthi updates). The bundled file is only
  // the first paint and the offline fallback. Re-read every 10 minutes so updates arrive without a reload.
  const [live, setLive] = useState<Partial<Record<string, Data>>>({});
  useEffect(() => {
    if (!apiOn()) return;
    let alive = true;
    const pull = () => api.cityData(s.city).then((d) => alive && d?.places?.length && setLive((cur) => ({ ...cur, [s.city]: d })));
    pull();
    const id = setInterval(pull, 10 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [s.city]);
  const data = useMemo(() => runFreshness(live[s.city] ?? SEEDS[s.city] ?? SEEDS.gwalior, today).data, [s.city, today, live]);

  const profile: Profile = useMemo(
    () => ({ ...DEFAULT_PROFILE, likes: likesFor(s.interests), dislikes: s.prefs.worship ? [] : ['spiritual'], // Elders or a wheelchair on this trip: plan short walks whatever the usual style.
      pace: s.prefs.elders ? 'relaxed' : s.prefs.pace, walking: s.prefs.elders || s.prefs.access ? 'low' : s.prefs.walking, budget: s.twists.budgetHalf ? 'low' : s.prefs.budget }),
    [s.interests, s.prefs, s.twists.budgetHalf],
  );

  // Twist card "festival crowd": every place reads as busy today.
  const counts: Counts = useMemo(
    () => (s.twists.festival ? { [today]: Object.fromEntries(data.places.map((p) => [p.id, 99])) } : {}),
    [s.twists.festival, today, data],
  );

  const plan = useMemo(() => {
    if (!s.quick) return null;
    const input: PlanInput = {
      date: today,
      start: s.quick.start,
      hours: s.quick.hours,
      startPoint: s.quick.startPoint,
      returnToStart: true,
      // Rain twist: nobody walks between places.
      modes: s.twists.rain ? ['auto', 'cab'] : s.prefs.modes.length ? s.prefs.modes : ['walk', 'auto'],
      group: s.prefs.group,
      payment: s.prefs.payment,
      profile,
      counts,
      // Crowded (moderator alert): the planner does not pick it today; a place the raahi added stays.
      exclude: [...s.twists.closed, ...s.skip, ...(s.removed ?? []), ...(s.twists.crowded ?? []).filter((id) => !s.added.includes(data.places.find((p) => p.units.some((u) => u.id === id))?.id ?? ''))],
      added: s.added,
      maxVisit: s.prefs.maxPerPlace,
    };
    if (s.order) {
      const units = allUnits(data);
      const seq = s.order.map((id) => units.find((u) => u.unit.id === id)).filter((x): x is NonNullable<typeof x> => !!x && !s.twists.closed.includes(x.unit.id));
      return timeSequence(data, input, seq);
    }
    return buildPlan(data, input);
  }, [s.quick, s.order, s.added, s.skip, s.removed, s.prefs.maxPerPlace, s.prefs.modes, s.prefs.group, s.prefs.payment, s.twists, profile, counts, data, today]);

  const reset = useCallback(() => setS(INITIAL), []);
  // A plan belongs to one city: switching starts the day fresh.
  const setCity = useCallback((c: CityId) => {
    setS((cur) => (cur.city === c ? cur : { ...cur, city: c, quick: null, order: null, done: [], skip: [], removed: [], added: [], mapFocus: null }));
  }, []);

  // With location on, the app opens in the city the raahi is standing in.
  useEffect(() => {
    if (!s.prefs.location || typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = cityNear(p.coords.latitude, p.coords.longitude);
        if (c) setCity(c);
      },
      () => undefined,
      { maximumAge: 300000, timeout: 10000 },
    );
  }, [s.prefs.location, setCity]);

  const value = useMemo(() => ({ s, set, data, today, profile, plan, level: levelOf(s.points), counts, reset, setCity }), [s, set, data, today, profile, plan, counts, reset, setCity]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
}
