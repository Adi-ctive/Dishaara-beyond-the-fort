// Data model for the place record (SRS §4.3) and the fact stamp (FR-VF-01).

export const LABELS = [
  'officially confirmed',
  'locally verified',
  'recently reported',
  'estimated',
  'historical pattern',
  'unverified',
  'conflicting',
  'potentially outdated',
] as const;
export type Label = (typeof LABELS)[number];

export type Lang = 'en' | 'hi';
export type L10n = { en: string; hi: string };
export type Cls = 'status' | 'fare' | 'hours' | 'fees' | 'rules' | 'history';

export interface Alt { t: L10n; s: Label; src: string; ver: string; v?: unknown }

/** A stored value with its stamp. v === null with no status means "unavailable" (reason in why). */
export interface Fact<T = unknown> {
  v?: T | null;
  t?: L10n;
  s?: Label;
  src?: string;
  ver?: string; // verified_at: date of the evidence (or the date read when undated)
  by?: string; // verified_by
  cls: Cls;
  why?: L10n;
  alt?: Alt[];
  rec?: number;
  was?: Label; // label before the freshness job aged it
}

/** brk: a closed spell inside the day (temples often close 12:00 to 16:00); visits never overlap it. */
export type Hours = { kind: 'sun' } | { kind: 'fixed'; open: string; close: string; brk?: { from: string; to: string } };
export type Who = 'indian' | 'foreign' | 'child';
export interface FeeRow { who: Who; label: L10n; cash?: number | null; online?: number | null; any?: number | null }
export interface Fees { ticket: string; rows: FeeRow[] }

export interface Unit {
  id: string;
  name: L10n;
  custodian: Fact;
  coord: [number, number];
  hours: Fact<Hours>;
  weeklyClosed: Fact<number[]>;
  lastEntry: Fact<string>;
  closures?: Fact<{ from: string; to: string }>[];
  ticket: string;
  fees: Fact<Fees>;
  coverage?: Fact;
  payment: Fact<{ cash: boolean | null; online: boolean | null }>;
  minVisit: Fact<number>;
}

export type GuardStatus = 'level1' | 'level2' | 'withdrawn' | 'notEligible';
/** Decision 25. publication: the custodian's own current publication showing the place open and ticketed (Level 1 evidence). */
export interface Guardrail { status: GuardStatus; publication?: Fact; dailyLimit: number | null; reason?: L10n; demo?: boolean }

/** Decision 28, FR-BR-08: excluded categories. A visitor may add these by name; the rules are shown first. */
export interface Sensitive { kind: 'worship' | 'contested' | 'residential'; dress: Fact; worship?: Fact }

/** Something a visitor can do there that is open to the public, legal and actually offered (boating, a show, a safari, rides).
 * The text (t) carries the price and timing as published; price is the lowest per-person price in rupees when known. */
export interface Activity extends Fact { id: string; name: L10n; kind: 'boating' | 'show' | 'ride' | 'safari' | 'trek' | 'water' | 'game' | 'food' | 'shopping' | 'other'; price?: number | null }
/** A question visitors ask, answered only from this place's stored facts (scripts/build_faqs.py). s and src are the answering fact's. */
export interface Faq { q: L10n; a: L10n; s?: Label; src?: string; ver?: string; from: string }

export interface Place {
  id: string;
  name: L10n;
  type: L10n;
  tags: string[];
  lesserKnown: boolean;
  insideFort: boolean;
  popularity?: Fact;
  guardrail: Guardrail;
  sensitive?: Sensitive;
  summary: Fact;
  contact: Fact;
  accessibility: Fact;
  facilities: Fact;
  rules: (Fact & { kind: 'mandatory' | 'safety' | 'courtesy' })[];
  notes: Fact[];
  activities?: Activity[];
  /** A real photo from Wikimedia Commons, shown with its author and licence. */
  photo?: { img: string; page: string; author: string; license: string; wikidata?: string };
  /** Official pages about the place (district site, MP Tourism, Incredible India, the custodian's own site). */
  official?: { name: string; url: string }[];
  faqs?: Faq[];
  units: Unit[];
}

export interface Source { name: string; type: string; evidence: string; date: string }
export interface FareBand extends Fact { mode: Mode; maxKm: number; min: number; max: number }
export interface Landmark { id: string; name: L10n; coord: [number, number] }

/** A number in the city directory (helplines, hospitals, police, transport), stamped like a fact. */
export interface DirEntry { id: string; cat: string; name: L10n; phones: string[]; address?: string; email?: string; website?: string; s: Label; src: string; ver: string }

/** A fair, festival or season (scripts/build_events.py). Exact dates when a source gives them, else a yearly window. */
export interface CityEvent {
  id: string; name: L10n; about: L10n; where: L10n; place?: string; tip?: L10n;
  from?: string; to?: string; window?: { start: string; end: string };
  s: Label; src: string; ver: string; crowd?: boolean;
  /** yearly: same dates each year; yearly-lunar: follows the Hindu calendar, month is known; once; moving: changes city or venue. */
  recurring?: 'yearly' | 'yearly-lunar' | 'once' | 'moving';
  series?: string; // occurrences of the same event share it, so a known date this year stops the guess
  watch?: L10n; // how to keep an eye out for the next one
  by?: string; // the saarthi who added it
}

/** An event on a day. guess: no dates for that year, so the window comes from an earlier year's dates. */
export type EventHit = CityEvent & { guess?: { from: string; to: string } };

export interface Data {
  city: { id: string; name: L10n; dataVersion: string; readAt: string; tz: number; center: [number, number] };
  emergency: string;
  sources: Record<string, Source>;
  landmarks: Landmark[];
  fares: FareBand[];
  stationFares: (Fact & { to: L10n; place: string })[];
  places: Place[];
  directory?: DirEntry[];
  directoryCats?: Record<string, L10n>;
  events?: CityEvent[];
}

export type Mode = 'walk' | 'auto' | 'cab';
export type Pace = 'relaxed' | 'normal' | 'fast';
export type Walking = 'low' | 'medium' | 'high';
export type Budget = 'low' | 'medium' | 'high';

export interface Profile {
  likes: string[];
  dislikes: string[];
  pace: Pace;
  walking: Walking;
  budget: Budget;
  lang: Lang;
}

export const DEFAULT_PROFILE: Profile = { likes: [], dislikes: [], pace: 'normal', walking: 'medium', budget: 'medium', lang: 'en' };

/** Planned visits per date per place, from saved Dishaara plans (FR-GR-04). */
export type Counts = Record<string, Record<string, number>>;
