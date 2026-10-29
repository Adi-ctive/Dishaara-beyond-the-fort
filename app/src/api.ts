// Backend client. The deployed app talks to its own API at /api (same site, no CORS). On the laptop,
// VITE_API_URL points at app/backend; without it every call returns null and the app runs on local state.
// Calls never throw: a failed call returns null and the screen keeps its local behaviour.

const BASE: string = (import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api' : '')).replace(/\/$/, '');
export const apiOn = () => !!BASE;
export const apiBase = () => BASE;

const TOKEN = 'dishaara.token';
function token(): string {
  try {
    return localStorage.getItem(TOKEN) ?? '';
  } catch {
    return '';
  }
}
function keep(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN, t);
    else localStorage.removeItem(TOKEN);
  } catch {
    /* storage blocked: the session lasts this page only */
  }
}
export const hasSession = () => !!token();

/** Last error message from the server, for screens that show why a write failed. */
export let lastError = '';

async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 8000): Promise<T | null> {
  if (!BASE) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const t = token();
    const r = await fetch(`${BASE}${path}`, {
      method,
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) {
      lastError = (await r.json().catch(() => null))?.detail ?? `error ${r.status}`;
      if (r.status === 401 && t && path === '/me') keep(null); // expired or banned
      return null;
    }
    lastError = '';
    return (await r.json()) as T;
  } catch {
    lastError = 'no connection';
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function upload<T>(path: string, file: Blob, name: string): Promise<T | null> {
  if (!BASE) return null;
  const fd = new FormData();
  fd.append('file', file, name);
  const t = token();
  try {
    const r = await fetch(`${BASE}${path}`, { method: 'POST', body: fd, headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (!r.ok) {
      lastError = (await r.json().catch(() => null))?.detail ?? `error ${r.status}`;
      return null;
    }
    return (await r.json()) as T;
  } catch {
    lastError = 'no connection';
    return null;
  }
}

/** Uploads a proof photo, voice note or short clip (multipart). Returns its id, or null with lastError set. */
export async function uploadProof(file: Blob, name = 'proof.jpg'): Promise<string | null> {
  return (await upload<{ id: string }>('/proofs', file, name))?.id ?? null;
}

/** A proof as an object URL with its type (it needs the session, so a plain <img src> cannot load it). */
export async function proofUrl(id: string): Promise<{ url: string; type: string } | null> {
  if (!BASE) return null;
  const t = token();
  const r = await fetch(`${BASE}/proofs/${id}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} }).catch(() => null);
  if (!r || !r.ok) return null;
  const b = await r.blob();
  return { url: URL.createObjectURL(b), type: b.type };
}

/** Shop photos are public. */
export const mediaUrl = (id: string) => `${BASE}/media/${id}`;
export const uploadShopPhoto = (file: Blob) => upload<Shop>('/business/me/photos', file, 'shop.jpg');
export const uploadPostPhoto = (file: Blob) => upload<{ id: string }>('/posts/media', file, 'post.jpg');

export type Me = { id: string; name: string; roles: string[]; email?: string; avatar?: string; frame?: string; banner?: string; points?: number; kind?: string };
export type Health = { ok: boolean; ai: boolean; tts: boolean; today: string; dwellSeconds: number; google: string | null; demoLogin: boolean; db: boolean };
export type Twists = { closed: string[]; crowded?: string[]; budgetHalf: boolean; rain: boolean; festival: boolean; testMode: boolean };
export type Reading = { lat: number; lng: number; accuracy: number; t: number };
export type StampRes = { status: 'confirmed' | 'pending' | 'rejected'; rarity: string; points: number; checks: { check: string; ok: boolean; soft?: boolean }[]; testMode: boolean };
export type SavedChat = { id: string; title: string; city?: string; count: number; updated: string };
/** A saarthi's event entry (field "Event"): dates may be an earlier year's for a yearly event. */
export type EventEntry = { name: string; start: string; end?: string; recurring: 'yearly' | 'yearly-lunar' | 'once' | 'moving'; where?: string; watch?: string };
export type ChatRes = { ai: boolean; text: string | null; engine?: string; note?: string; emergency?: boolean; placeIds?: string[]; followUps?: string[] };
export type Ticket = { id: string; place: string; from: string; text: string; status: 'open' | 'answered' | 'escalated'; proof?: string; answer?: string };
export type ServerPost = { id: string; by: string; byName: string; byRole?: string; community?: string; biz?: string | null; kind: string; text: string; place?: string; city?: string; likes: number; saves: number; comments: number; at: string; liked?: boolean; saved?: boolean; mine?: boolean; media?: string[] };
export type LeaderRow = { rank: number; id: string; name: string; avatar?: string | null; frame?: string | null; points: number; level: number; stamps: number; me: boolean };
export type ServerComment = { id: string; by: string; byName: string; text: string; at: string };
export type Shop = { commentCount?: number; visits?: number; id: string; owner: string; ownerName?: string; name: string; kind: 'food' | 'craft' | 'stay' | 'guide' | 'shop' | 'activity'; city: string; near?: string; details?: string; phone?: string; lat?: number | null; lng?: number | null; tags?: string[]; sponsored?: boolean; status: string; followers?: number; following?: boolean; visitedToday?: boolean; photos?: string[] };
export type SaarthiPage = { id: string; rank?: string; approved?: number; name: string; avatar?: string; frame?: string; banner?: string; region?: string; followers: number; following: boolean; posts: ServerPost[] };

let health: Promise<Health | null> | null = null;

async function signedIn(r: { token: string; user: Me } | null) {
  if (r) keep(r.token);
  return r?.user ?? null;
}

export const api = {
  /** The city record from the database: the reviewed file plus every approved saarthi entry. */
  cityData: (city: string) => call<import('./core').Data>('GET', `/cities/${city}/data`, undefined, 10000),
  health: () => (health ??= call<Health>('GET', '/health', undefined, 4000)),
  /** Google: the ID token from Google's button. Demo: name only, when the server allows it. */
  signInGoogle: async (credential: string) => signedIn(await call<{ token: string; user: Me }>('POST', '/auth/google', { credential })),
  signInDemo: async (name: string) => signedIn(await call<{ token: string; user: Me }>('POST', '/auth/google', { name })),
  signInStaff: async (username: string, password: string) => signedIn(await call<{ token: string; user: Me }>('POST', '/auth/staff', { username, password })),
  signInEmail: async (email: string, password: string) => signedIn(await call<{ token: string; user: Me }>('POST', '/auth/email', { email, password })),
  me: () => (token() ? call<Me>('GET', '/me') : Promise.resolve(null)),
  signOut: () => keep(null),
  putProfile: (p: { interests?: string[]; prefs?: object; prompt?: string[]; avatar?: string; frame?: string; banner?: string; city?: string }) => call('PUT', '/me/profile', p),
  progress: () => call<{ points: number; level: number; streak: number; stamps: number; rare: number; quiet: number; feedback: number; food: number; night: number; cities: number; indoreStamps: number }>('GET', '/me/progress'),
  myStamps: () => call<Record<string, { status: 'confirmed' | 'pending'; rarity: string; quiet: boolean; t: number; date: string; city: string }>>('GET', '/me/stamps'),
  leaderboard: (period: 'week' | 'all') => call<{ rows: LeaderRow[]; myRank: number | null; players: number }>('GET', `/leaderboard?period=${period}`),
  applySaarthi: (region: string, note: string) => call<{ status: string }>('POST', '/me/apply-saarthi', { region, note }),
  savePlan: (p: object) => call<{ id: string }>('POST', '/plans', p),
  myPlans: () => call<{ id: string; input: { date?: string }; order?: string[] | null; done?: string[]; city?: string; at?: string }[]>('GET', '/me/plans'),
  chat: (b: { text: string; history: { role: string; text: string }[]; lang: string; prompt: string[]; roadmap?: object; city?: string; origin?: { name: string; lat: number; lng: number }; lastPlaces?: string[]; earlier?: string; chatId?: string }) => call<ChatRes>('POST', '/chat', b, 20000),
  stamp: (b: { placeId: string; readings: Reading[]; code?: string }) => call<StampRes>('POST', '/stamps', b),
  feedback: (b: { placeId: string; answers: object; note: string }) => call<{ ticket: string; points: number }>('POST', '/feedback', b),
  stillTrue: (placeId: string, yes: boolean) => call('POST', '/still-true', { placeId, yes }),
  readPlace: (placeId: string) => call('POST', `/me/read/${encodeURIComponent(placeId)}`),
  quests: () => call<{ id: string; en: string; hi: string; pts: number; need: number; have: number; done: boolean; paidNow: number }[]>('GET', '/me/quests'),
  sos: (b: { lat?: number; lng?: number; accuracy?: number }) => call('POST', '/sos', b),
  alerts: (city = 'gwalior') => call<{ id: string; kind: string; en: string; hi?: string; source: string; at: string; link?: string; live?: boolean }[]>('GET', `/alerts?city=${city}`),
  // social
  feed: (q: { tab?: 'all' | 'following' | 'saved'; city?: string; place?: string; by?: string; community?: string; sort?: 'new' | 'top' } = {}) =>
    call<ServerPost[]>('GET', `/feed?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`),
  post: (b: { kind: 'post' | 'question' | 'fact' | 'photo' | 'blog' | 'video' | 'offer'; text: string; placeId?: string; city?: string; community?: string; as?: string; media?: string[] }) => call<ServerPost>('POST', '/posts', b),
  like: (id: string, on: boolean) => call<ServerPost>('POST', `/posts/${id}/like`, { on }),
  save: (id: string, on: boolean) => call<ServerPost>('POST', `/posts/${id}/save`, { on }),
  comments: (id: string) => call<ServerComment[]>('GET', `/posts/${id}/comments`),
  comment: (id: string, text: string) => call<ServerComment>('POST', `/posts/${id}/comments`, { text }),
  follow: (target: string, on: boolean) => call<{ following: boolean; followers: number }>('POST', `/follow/${target}`, { on }),
  myFacts: () => call<{ id: string; place: string; field: string; value: string; label: string; status: string; proofCount: number; date: string }[]>('GET', '/facts/mine'),
  addProofLater: (id: string, proof: string[]) => call<{ id: string; proof: string[] }>('POST', `/facts/${id}/proof`, { proof }),
  chats: () => call<SavedChat[]>('GET', '/chats'),
  chatGet: (id: string) => call<{ id: string; title: string; city?: string; msgs: unknown[] }>('GET', `/chats/${id}`),
  chatSave: (id: string, b: { title: string; city: string; msgs: unknown[] }) => call<{ ok: boolean }>('PUT', `/chats/${id}`, b),
  chatDelete: (id: string) => call<{ ok: boolean }>('DELETE', `/chats/${id}`),
  deletePost: (id: string) => call<{ id: string; status: string }>('DELETE', `/posts/${id}`),
  deleteComment: (id: string) => call<{ id: string; status: string }>('DELETE', `/comments/${id}`),
  report: (target: string, kind: 'post' | 'comment', reason = '') => call('POST', `/report/${target}`, { kind, reason }),
  saarthi: (id: string) => call<SaarthiPage>('GET', `/saarthis/${id}`),
  // bazaar: only shops whose owners applied and a moderator approved
  bazaar: (city: string, route: string[] = []) => call<Shop[]>('GET', `/bazaar?city=${city}${route.length ? `&route=${route.join(',')}` : ''}`),
  shop: (id: string) => call<Shop>('GET', `/bazaar/${id}`),
  shopComments: (id: string) => call<ServerComment[]>('GET', `/bazaar/${id}/comments`),
  shopComment: (id: string, text: string) => call<ServerComment>('POST', `/bazaar/${id}/comments`, { text }),
  shopVisit: (id: string) => call<{ points: number }>('POST', `/bazaar/${id}/visit`),
  applyBusiness: (b: { name: string; kind: string; city: string; near?: string; details?: string; phone?: string; lat?: number; lng?: number }) => call<Shop>('POST', '/me/apply-business', b),
  myBusiness: () => call<Shop>('GET', '/business/me'),
  putBusiness: (b: Partial<Shop>) => call<Shop>('PUT', '/business/me', b),
  businessComments: () => call<ServerComment[]>('GET', '/business/me/comments'),
  deleteShopPhoto: (id: string) => call<Shop>('DELETE', `/business/me/photos/${id}`),
  sponsorRequest: () => call('POST', '/business/me/sponsor-request'),
  // saarthi
  tickets: () => call<Ticket[]>('GET', '/tickets'),
  answerTicket: (id: string, answer: string, escalate = false) => call<Ticket>('POST', `/tickets/${id}/answer`, { answer, escalate }),
  saarthiMe: () => call<{ id: string; name: string; region: string; checks: number; approved: number; toVerify: number; openTickets: number; followers: number }>('GET', '/saarthi/me'),
  verifyQueue: () => call<{ id: string; place: string; field: string; value: string; by: string; risk: string }[]>('GET', '/verify-queue'),
  verify: (id: string, ok: boolean) => call('POST', `/verify/${id}`, { ok }),
  addFact: (b: { placeId: string; city?: string; unitId?: string | null; field: string; value: string; label: string; proof?: string[]; event?: EventEntry }) => call<{ id: string; risk: string; route: 'moderator' | 'saarthi' }>('POST', '/facts', b),
  saarthiTodo: (city: string) => call<{ place: string; name: string; items: { field: string; unit: string | null; unitName: string | null; state: string; now?: string; waiting: boolean }[] }[]>('GET', `/saarthi/todo?city=${city}`),
  // moderator
  getTwists: () => call<Twists>('GET', '/mod/twists', undefined, 3000),
  putTwists: (t: Partial<Twists>) => call<Twists>('PUT', '/mod/twists', t),
  modOverview: () => call<{ places: number; openTickets: number; saarthis: number; users: number; sos: number; queue: number }>('GET', '/mod/overview'),
  modQueues: () => call<{ id: string; kind: string; title: string; detail: string; status?: string; proof?: string[] }[]>('GET', '/mod/queues'),
  decide: (id: string, approve: boolean) => call('POST', `/mod/queues/${id}`, { approve }),
  news: () => call<{ id: string; en: string; source: string; at: string; status: string; city?: string; link?: string }[]>('GET', '/mod/news'),
  decideNews: (id: string, approve: boolean) => call('POST', `/mod/news/${id}`, { approve }),
  sosFeed: () => call<{ id: string; date?: string; time: string; name: string; lat?: number | null; lng?: number | null; accuracy?: number | null; city?: string | null; note?: string; status?: string; handledBy?: string; handledAt?: string; handledNote?: string;
    account: { id: string; name?: string; email?: string; signIn: string; roles: string[]; joined?: string | null; city?: string; points: number; group: Record<string, unknown>; lastStamp: { place: string; date?: string; time: string } | null; lastPlan: { date?: string; stops: string[]; done: string[] } | null; earlierPresses: number } | null }[]>('GET', '/mod/sos'),
  sosHandled: (id: string, note: string) => call<{ status: string; handledBy: string; handledAt: string; handledNote: string }>('POST', `/mod/sos/${id}`, { note }),
  modUsers: (q = '') => call<{ id: string; name: string; roles: string[]; kind: string; banned: boolean; points: number }[]>('GET', `/mod/users?q=${encodeURIComponent(q)}`),
  ban: (id: string, banned: boolean) => call('POST', `/mod/users/${id}/ban`, { banned }),
};
