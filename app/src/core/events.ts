import type { CityEvent, Data, EventHit } from './types';

const DAY = 86400000;
const shift = (md: string, days: number) => new Date(Date.UTC(2001, Number(md.slice(0, 2)) - 1, Number(md.slice(3)) + days)).toISOString().slice(5, 10);

/** Is this yearly window ("MM-DD" to "MM-DD", may wrap over New Year) open on the date? */
function inWindow(w: { start: string; end: string }, date: string): boolean {
  const md = date.slice(5);
  return w.start <= w.end ? md >= w.start && md <= w.end : md >= w.start || md <= w.end;
}

/** The yearly window an earlier occurrence suggests: the same days, or about three weeks either side for a lunar date. */
function guessWindow(e: CityEvent): { start: string; end: string } {
  const pad = e.recurring === 'yearly-lunar' ? 20 : 0;
  return { start: shift(e.from!.slice(5), -pad), end: shift(e.to!.slice(5), pad) };
}

/**
 * Events on a date, in three tiers: exact dates for that occasion, yearly windows from a source, and, for a yearly event
 * whose dates for that time are not known yet, a guess from the latest earlier occurrence (shown as historical pattern).
 * Pure, so the planner, the roadmap and the chat agree.
 */
export function eventsOn(data: Data, date: string): EventHit[] {
  const all = data.events ?? [];
  const exact = all.filter((e) => e.from && e.to && date >= e.from && date <= e.to);
  const pattern = all.filter((e) => !e.from && e.window && inWindow(e.window, date));
  const known = new Set(exact.map((e) => e.series ?? e.id));
  const guesses: EventHit[] = [];
  const latest = new Map<string, CityEvent>();
  for (const e of all) {
    if (!e.from || !e.to || e.to >= date || !(e.recurring === 'yearly' || e.recurring === 'yearly-lunar')) continue;
    const key = e.series ?? e.id;
    if (!latest.has(key) || latest.get(key)!.from! < e.from) latest.set(key, e);
  }
  for (const [key, e] of latest) {
    // A later occurrence with dates already on record (even one that does not cover this day) means no guess is needed.
    const later = all.some((x) => (x.series ?? x.id) === key && x.from && x.from > e.from! && Math.abs(Date.parse(x.from) - Date.parse(date)) < 200 * DAY);
    if (known.has(key) || later || !inWindow(guessWindow(e), date)) continue;
    guesses.push({ ...e, s: 'historical pattern', guess: { from: e.from!, to: e.to! } });
  }
  return [...exact, ...pattern, ...guesses];
}

/** Events touching any day of a month ("YYYY-MM"). */
export function eventsInMonth(data: Data, month: string): EventHit[] {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const seen = new Map<string, EventHit>();
  for (let d = 1; d <= days; d++) for (const e of eventsOn(data, `${month}-${String(d).padStart(2, '0')}`)) if (!seen.has(e.id)) seen.set(e.id, e);
  return [...seen.values()];
}
