import { checkUnit, latestArrival, TICKET_BUFFER, visitMinutes, windowFor, type CheckResult } from './feasibility';
import { makeLeg, type Leg } from './geo';
import { guardrail } from './guardrail';
import { toMin } from './time';
import type { Counts, Data, Fees, Mode, Place, Profile, Unit, Who } from './types';

// Time-fit plan builder (FR-PL-01..09). Same inputs + same data version → same plan (FR-PL-08).

export interface PlanInput {
  date: string;
  start: string; // HH:MM
  hours: number; // 1–14
  startPoint: string; // landmark id
  returnToStart: boolean;
  modes: Mode[];
  group: Record<Who, number>;
  payment: 'cash' | 'online';
  profile: Profile;
  counts?: Counts;
  exclude?: string[]; // unit ids
}

export interface Stop {
  unit: Unit;
  place: Place;
  leg: Leg;
  arrive: number; // arrival at the site (after any wait for opening)
  wait: number;
  ticket: number;
  visit: number;
  depart: number;
  check: CheckResult;
  needsConfirmation: boolean;
}

export interface Range { min: number; max: number; partial: boolean }
export interface Plan {
  input: PlanInput;
  stops: Stop[];
  returnLeg: Leg | null;
  startMin: number;
  endMin: number; // end of the time window
  finish: number; // actual end incl. return
  budget: { fees: Range; fares: Range; total: Range };
  needsConfirmation: boolean;
  leftOut: { unit: Unit; place: Place; reason: string }[];
  dataVersion: string;
}

export const LESSER_KNOWN_BOOST = 6; // FR-PL-09: capped boost, Level 2 places only (Decision 25)
export const people = (g: Record<Who, number>) => g.indian + g.foreign + g.child;

export const allUnits = (data: Data) => data.places.flatMap((place) => place.units.map((unit) => ({ unit, place })));

export function startCoord(data: Data, id: string): [number, number] {
  return (data.landmarks.find((l) => l.id === id) ?? data.landmarks[0]).coord;
}

export const score = (place: Place, likes: string[]) =>
  (likes.length ? place.tags.filter((t) => likes.includes(t)).length * 10 : 5) + (place.lesserKnown && place.guardrail.status === 'level2' ? LESSER_KNOWN_BOOST : 0);

/** Why a unit cannot be a candidate stop, or null if it can (FR-PL-01, FR-GR-02/03). */
export function candidacy(data: Data, unit: Unit, place: Place, input: PlanInput): string | null {
  if (input.exclude?.includes(unit.id)) return 'excluded';
  if (!guardrail(place, input.date, input.counts).ok) return 'guardrail';
  if (place.tags.some((t) => input.profile.dislikes.includes(t))) return 'dislike';
  if (!windowFor(data, unit, input.date)) return 'hoursUnavailable';
  if (checkUnit(data, unit, input.date, { pace: input.profile.pace }).verdict === 'not') return 'notFeasible';
  return null;
}

interface Cursor { pos: [number, number]; t: number; inFort: boolean }

/** Try to place one unit after the cursor. Returns null if it breaks hours, last entry or the window. */
function tryStop(data: Data, input: PlanInput, cur: Cursor, unit: Unit, place: Place, endMin: number, home: [number, number]): Stop | null {
  const w = windowFor(data, unit, input.date);
  if (!w) return null;
  const opts = { modes: input.modes, walking: input.profile.walking, budget: input.profile.budget, people: people(input.group) };
  const leg = makeLeg(data, cur.pos, unit.coord, { ...opts, insideFort: cur.inFort && place.insideFort });
  const reach = cur.t + leg.minutes + leg.buffer;
  const visit = visitMinutes(unit, input.profile.pace);
  const arrive = Math.max(reach, w.open);
  if (arrive > latestArrival(w, visit)) return null;
  const depart = arrive + TICKET_BUFFER + visit;
  if (depart > w.close) return null;
  if (input.returnToStart) {
    const back = makeLeg(data, unit.coord, home, { ...opts, insideFort: false });
    if (depart + back.minutes + back.buffer > endMin) return null;
  } else if (depart > endMin) return null;
  const check = checkUnit(data, unit, input.date, { arrival: arrive, pace: input.profile.pace, payment: input.payment });
  if (check.verdict === 'not') return null;
  return { unit, place, leg, arrive, wait: arrive - reach, ticket: TICKET_BUFFER, visit, depart, check, needsConfirmation: check.verdict === 'confirm' };
}

function feeFor(fees: Fees | null | undefined, who: Who, payment: 'cash' | 'online'): { min: number; max: number } | null {
  const rows = fees?.rows.filter((r) => r.who === who) ?? [];
  const vals = rows.map((r) => r.any ?? (payment === 'cash' ? r.cash : r.online) ?? r.cash ?? r.online ?? null);
  if (!vals.length || vals.some((v) => v === null || v === undefined)) return null;
  const nums = vals as number[];
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** FR-PL-06: entry fees for the group (each ticket once) plus leg fares. Unknowns make the budget partial (E11). */
export function budget(stops: Stop[], legs: Leg[], input: PlanInput): Plan['budget'] {
  const fees: Range = { min: 0, max: 0, partial: false };
  const seen = new Set<string>();
  for (const s of stops) {
    if (seen.has(s.unit.ticket)) continue;
    seen.add(s.unit.ticket);
    for (const who of ['indian', 'foreign', 'child'] as Who[]) {
      const n = input.group[who];
      if (!n) continue;
      const f = feeFor(s.unit.fees.v, who, input.payment);
      if (!f) fees.partial = true;
      else { fees.min += f.min * n; fees.max += f.max * n; }
    }
  }
  const fares: Range = { min: 0, max: 0, partial: false };
  for (const l of legs) {
    if (!l.fare) fares.partial = true;
    else { fares.min += l.fare.min; fares.max += l.fare.max; }
  }
  return { fees, fares, total: { min: fees.min + fares.min, max: fees.max + fares.max, partial: fees.partial || fares.partial } };
}

function finishPlan(data: Data, input: PlanInput, stops: Stop[], startMin: number, endMin: number, leftOut: Plan['leftOut']): Plan {
  const home = startCoord(data, input.startPoint);
  const last = stops[stops.length - 1];
  const returnLeg = input.returnToStart && last
    ? makeLeg(data, last.unit.coord, home, { modes: input.modes, walking: input.profile.walking, budget: input.profile.budget, insideFort: false, people: people(input.group) })
    : null;
  const finish = returnLeg ? last.depart + returnLeg.minutes + returnLeg.buffer : last ? last.depart : startMin;
  const legs = [...stops.map((s) => s.leg), ...(returnLeg ? [returnLeg] : [])];
  return {
    input, stops, returnLeg, startMin, endMin, finish,
    budget: budget(stops, legs, input),
    needsConfirmation: stops.some((s) => s.needsConfirmation),
    leftOut, dataVersion: data.city.dataVersion,
  };
}

/** Greedy time-fit builder: at each step take the best-scoring stop that still fits. */
export function buildPlan(data: Data, input: PlanInput): Plan {
  const startMin = toMin(input.start);
  const endMin = startMin + Math.round(input.hours * 60);
  const home = startCoord(data, input.startPoint);
  const leftOut: Plan['leftOut'] = [];
  let pool = allUnits(data).filter(({ unit, place }) => {
    const why = candidacy(data, unit, place, input);
    // Unflagged places are not even listed as "left out": they are never promoted (FR-GR-03).
    if (why && why !== 'guardrail' && why !== 'excluded') leftOut.push({ unit, place, reason: why });
    return !why;
  });
  const stops: Stop[] = [];
  let cur: Cursor = { pos: home, t: startMin, inFort: false };
  for (;;) {
    let best: { s: Stop; value: number } | null = null;
    for (const { unit, place } of pool) {
      const s = tryStop(data, input, cur, unit, place, endMin, home);
      if (!s) continue;
      const value = score(place, input.profile.likes) * 8 - (s.leg.minutes + s.leg.buffer) - s.wait / 2;
      if (!best || value > best.value || (value === best.value && unit.id < best.s.unit.id)) best = { s, value };
    }
    if (!best) break;
    stops.push(best.s);
    pool = pool.filter((c) => c.unit.id !== best!.s.unit.id);
    cur = { pos: best.s.unit.coord, t: best.s.depart, inFort: best.s.place.insideFort };
  }
  for (const { unit, place } of pool) leftOut.push({ unit, place, reason: 'noTime' });
  return finishPlan(data, input, stops, startMin, endMin, leftOut);
}

/** Time a fixed order of units, dropping any that no longer fit (used for replans, FR-AL-01). */
export function timeSequence(data: Data, input: PlanInput, seq: { unit: Unit; place: Place }[]): Plan {
  const startMin = toMin(input.start);
  const endMin = startMin + Math.round(input.hours * 60);
  const home = startCoord(data, input.startPoint);
  const stops: Stop[] = [];
  const leftOut: Plan['leftOut'] = [];
  let cur: Cursor = { pos: home, t: startMin, inFort: false };
  for (const { unit, place } of seq) {
    const s = tryStop(data, input, cur, unit, place, endMin, home);
    if (!s) { leftOut.push({ unit, place, reason: 'noTime' }); continue; }
    stops.push(s);
    cur = { pos: unit.coord, t: s.depart, inFort: place.insideFort };
  }
  return finishPlan(data, input, stops, startMin, endMin, leftOut);
}

export { tryStop as _tryStop };
