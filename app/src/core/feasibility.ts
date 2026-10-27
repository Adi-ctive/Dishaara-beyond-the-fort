import { STRONG, isUnavailable } from './facts';
import { sunTimes, weekday } from './time';
import type { Data, Fact, Pace, Unit } from './types';

// "Can I actually visit?" rules engine (SRS §6.4, FR-FC-01..04). Deterministic; the LLM never decides it.

export type Verdict = 'good' | 'precautions' | 'confirm' | 'not';
export interface Reason { code: string; p?: Record<string, string | number>; fact?: Fact }
export interface CheckResult { verdict: Verdict; reasons: Reason[]; notes: Reason[]; window: { open: number; close: number } | null }

export const TICKET_BUFFER = 10; // FR-PL-03 ticket-queue buffer per stop
export const NEAR_LAST_ENTRY = 30; // §6.4 default

export const visitMinutes = (u: Unit, pace: Pace) => {
  const min = u.minVisit.v ?? 30;
  const rec = u.minVisit.rec ?? min;
  return pace === 'relaxed' ? rec : pace === 'fast' ? min : Math.round((min + rec) / 10) * 5;
};

export function windowFor(data: Data, u: Unit, date: string): { open: number; close: number } | null {
  const h = u.hours.v;
  if (!h) return null;
  if (h.kind === 'sun') {
    const s = sunTimes(date, u.coord[0], u.coord[1], data.city.tz);
    return { open: s.rise, close: s.set };
  }
  const [oh, om] = h.open.split(':').map(Number);
  const [ch, cm] = h.close.split(':').map(Number);
  return { open: oh * 60 + om, close: ch * 60 + cm };
}

/** Latest arrival so that ticket buffer + minimum visit end by closing (FR-PL-02). */
export const latestArrival = (w: { close: number }, visit: number) => w.close - TICKET_BUFFER - visit;

export function checkUnit(
  data: Data,
  u: Unit,
  date: string,
  opts: { arrival?: number; pace?: Pace; payment?: 'cash' | 'online' } = {},
): CheckResult {
  const pace = opts.pace ?? 'normal';
  const dow = weekday(date);
  const w = windowFor(data, u, date);
  const visit = visitMinutes(u, pace);
  const not: Reason[] = [];
  const confirm: Reason[] = [];
  const prec: Reason[] = [];

  // 1. Not feasible
  const wc = u.weeklyClosed;
  const closedDays = Array.isArray(wc.v) ? wc.v : [];
  if (wc.s === 'conflicting') {
    const altDays = (wc.alt ?? []).flatMap((a) => (Array.isArray(a.v) ? (a.v as number[]) : []));
    if (closedDays.includes(dow) || altDays.includes(dow)) confirm.push({ code: 'closureConflict', p: { dow }, fact: wc });
  } else if (closedDays.includes(dow)) not.push({ code: 'weeklyClosed', p: { dow }, fact: wc });
  for (const c of u.closures ?? []) if (c.v && date >= c.v.from && date <= c.v.to) not.push({ code: 'closure', fact: c });
  if (w) {
    const latest = latestArrival(w, visit);
    if (latest < w.open) not.push({ code: 'tooShort', p: { visit } });
    else if (opts.arrival !== undefined && opts.arrival > latest) not.push({ code: 'tooLate', p: { latest, visit }, fact: u.hours });
    else if (opts.arrival !== undefined && latest - opts.arrival <= NEAR_LAST_ENTRY) prec.push({ code: 'nearLastEntry', p: { latest } });
    if (opts.arrival !== undefined && opts.arrival < w.open) prec.push({ code: 'opensAt', p: { open: w.open } });
  }

  // 2. Needs confirmation: a decisive fact is unavailable, weak or not strongly confirmed.
  const decisive: [string, Fact][] = [['hours', u.hours], ['weeklyClosed', u.weeklyClosed], ['lastEntry', u.lastEntry]];
  // Round 1 (submitted): a decisive missing fact makes the verdict "needs confirmation". The app names which one and how to check it.
  for (const [field, f] of decisive) {
    if (isUnavailable(f) || f.v === null) confirm.push({ code: 'unavailable', p: { field }, fact: f });
    else if (f.s === 'conflicting') { if (field !== 'weeklyClosed') confirm.push({ code: 'weak', p: { field, status: f.s }, fact: f }); }
    else if (!STRONG.includes(f.s!)) confirm.push({ code: 'weak', p: { field, status: f.s! }, fact: f });
  }

  // 3. Precautions
  const pay = u.payment.v;
  if (opts.payment === 'online' && pay && pay.cash && pay.online === false) prec.push({ code: 'cashOnly', fact: u.payment });

  if (not.length) return { verdict: 'not', reasons: not, notes: [...confirm, ...prec], window: w };
  if (confirm.length) return { verdict: 'confirm', reasons: confirm, notes: prec, window: w };
  if (prec.length) return { verdict: 'precautions', reasons: prec, notes: [], window: w };
  return { verdict: 'good', reasons: [{ code: 'allConfirmed' }], notes: [], window: w };
}

const ORDER: Verdict[] = ['not', 'confirm', 'precautions', 'good'];
/** Place-level verdict: the best section verdict, with section results listed (FR-FC-04). */
export const bestVerdict = (vs: Verdict[]) => ORDER[Math.max(...vs.map((v) => ORDER.indexOf(v)))];
