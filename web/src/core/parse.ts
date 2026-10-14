// Deterministic trip-text parsing: the no-AI path for chat-started plans (FR-AI-10),
// the date/weekday check (SRS E19) and the coverage check (FR-AI-11, E20).

const MONTHS: [RegExp, number][] = [
  [/^(jan|जनवरी)/, 0], [/^(feb|फ़रवरी|फरवरी)/, 1], [/^(mar|मार्च)/, 2], [/^(apr|अप्रैल)/, 3], [/^(may|मई)/, 4], [/^(jun|जून)/, 5],
  [/^(jul|जुलाई)/, 6], [/^(aug|अगस्त)/, 7], [/^(sep|सितंबर|सितम्बर)/, 8], [/^(oct|अक्टूबर)/, 9], [/^(nov|नवंबर|नवम्बर)/, 10], [/^(dec|दिसंबर|दिसम्बर)/, 11],
];
export const WEEKDAYS: [RegExp, number][] = [
  [/\b(sunday|sun)\b|रविवार/, 0], [/\b(monday|mon)\b|सोमवार/, 1], [/\b(tuesday|tue)\b|मंगलवार/, 2], [/\b(wednesday|wed)\b|बुधवार/, 3],
  [/\b(thursday|thu)\b|गुरुवार|बृहस्पतिवार/, 4], [/\b(friday|fri)\b|शुक्रवार/, 5], [/\b(saturday|sat)\b|शनिवार/, 6],
];
const COVERED = ['gwalior', 'ग्वालियर'];
const KNOWN_CITIES = ['agra', 'delhi', 'jaipur', 'orchha', 'bhopal', 'indore', 'mumbai', 'goa', 'varanasi', 'udaipur', 'jhansi', 'khajuraho',
  'kolkata', 'chennai', 'bengaluru', 'bangalore', 'hyderabad', 'pune', 'lucknow', 'आगरा', 'दिल्ली', 'जयपुर', 'ओरछा', 'भोपाल', 'इंदौर',
  'मुंबई', 'गोवा', 'वाराणसी', 'उदयपुर', 'झांसी', 'खजुराहो'];
const LANDMARK_WORDS: [RegExp, string][] = [
  [/station|स्टेशन/, 'station'], [/jai ?vilas|जय ?विलास/, 'jaivilas'], [/tansen|ghauspura|तानसेन|गौसपुरा/, 'ghauspura'], [/fort|किला|किले/, 'fort'],
];

export const isCovered = (city: string) => COVERED.includes(city.trim().toLowerCase());

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const dowOf = (s: string) => new Date(s + 'T00:00:00Z').getUTCDay();
const shift = (s: string, n: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export interface Parsed {
  date?: string;
  mismatch?: { date: string; stated: number; actual: number; options: [string, string] };
  hours?: number;
  start?: string;
  startPoint?: string;
  uncoveredCity?: string;
}

/** The nearest date with the stated weekday (ties go forward), e.g. Fri 20 Nov + "Sunday" → Sun 22 Nov. */
export function nearestWeekday(date: string, stated: number): string {
  const fwd = (stated - dowOf(date) + 7) % 7;
  const back = 7 - fwd;
  return fwd <= back ? shift(date, fwd) : shift(date, -back);
}

export function parseTrip(text: string, today: string): Parsed {
  const s = text.toLowerCase();
  const out: Parsed = {};
  const city = KNOWN_CITIES.find((c) => new RegExp(`(^|[^a-z\\u0900-\\u097f])${c}($|[^a-z\\u0900-\\u097f])`).test(s));
  if (city) { out.uncoveredCity = city; return out; }

  const stated = WEEKDAYS.find(([re]) => re.test(s))?.[1];
  let day: number | undefined, mon: number | undefined, year: number | undefined;
  for (const m of s.matchAll(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-zऀ-ॿ]+)\.?(?:\s+(\d{4}))?/g)) {
    const mi = MONTHS.find(([re]) => re.test(m[2]));
    if (mi) { day = +m[1]; mon = mi[1]; year = m[3] ? +m[3] : undefined; break; }
  }
  if (mon === undefined) for (const m of s.matchAll(/([a-zऀ-ॿ]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/g)) {
    const mi = MONTHS.find(([re]) => re.test(m[1]));
    if (mi) { day = +m[2]; mon = mi[1]; year = m[3] ? +m[3] : undefined; break; }
  }
  const isoM = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoM) { year = +isoM[1]; mon = +isoM[2] - 1; day = +isoM[3]; }
  if (mon !== undefined && day !== undefined) {
    let y = year ?? +today.slice(0, 4);
    let d = iso(y, mon, day);
    if (!year && d < today) d = iso(++y, mon, day);
    if (stated !== undefined && stated !== dowOf(d)) out.mismatch = { date: d, stated, actual: dowOf(d), options: [d, nearestWeekday(d, stated)] };
    else out.date = d;
  } else if (stated !== undefined) {
    const fwd = (stated - dowOf(today) + 7) % 7 || 7;
    out.date = shift(today, fwd);
  } else if (/tomorrow|कल/.test(s)) out.date = shift(today, 1);
  else if (/today|आज/.test(s)) out.date = today;

  const h = s.match(/(\d{1,2}(?:\.\d)?)\s*(hours|hour|hrs|hr|h\b|घंटे|घंटा)/);
  if (h) out.hours = Math.min(14, Math.max(1, +h[1]));
  if (/noon|दोपहर/.test(s)) out.start = '12:00';
  const t = s.match(/(?:from|at|से)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|बजे)/);
  if (t) {
    let hh = +t[1];
    if (t[3] === 'pm' && hh < 12) hh += 12;
    if (t[3] === 'am' && hh === 12) hh = 0;
    out.start = `${String(hh).padStart(2, '0')}:${t[2] ?? '00'}`;
  }
  const after = s.split(/starting (?:at|from)|start(?:ing)? at|from|से शुरू/).slice(1).join(' ');
  const lm = LANDMARK_WORDS.find(([re]) => re.test(after || s));
  if (lm) out.startPoint = lm[1];
  return out;
}
