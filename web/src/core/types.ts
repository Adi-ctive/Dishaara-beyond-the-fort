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

export type Hours = { kind: 'sun' } | { kind: 'fixed'; open: string; close: string };
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

export interface Place {
  id: string;
  name: L10n;
  type: L10n;
  tags: string[];
  lesserKnown: boolean;
  insideFort: boolean;
  popularity?: Fact;
  guardrail: Guardrail;
  summary: Fact;
  contact: Fact;
  accessibility: Fact;
  facilities: Fact;
  rules: (Fact & { kind: 'mandatory' | 'safety' | 'courtesy' })[];
  notes: Fact[];
  units: Unit[];
}

export interface Source { name: string; type: string; evidence: string; date: string }
export interface FareBand extends Fact { mode: Mode; maxKm: number; min: number; max: number }
export interface Landmark { id: string; name: L10n; coord: [number, number] }

export interface Data {
  city: { id: string; name: L10n; dataVersion: string; readAt: string; tz: number; center: [number, number] };
  emergency: string;
  sources: Record<string, Source>;
  landmarks: Landmark[];
  fares: FareBand[];
  stationFares: (Fact & { to: L10n; place: string })[];
  places: Place[];
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
