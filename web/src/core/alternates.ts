import { checkUnit, latestArrival, TICKET_BUFFER, visitMinutes, windowFor } from './feasibility';
import { makeLeg } from './geo';
import { guardrail } from './guardrail';
import { allUnits, people, score, startCoord, timeSequence, type Plan } from './planner';
import type { Data, Place, Unit } from './types';

// "Can't make it" → up to three alternates (FR-AL-01..04, SRS E4).

export interface Alternate { unit: Unit; place: Place; travel: number; match: number; arrive: number; verdict: string }

export function findAlternates(data: Data, plan: Plan, index: number): Alternate[] {
  const input = plan.input;
  const prev = plan.stops[index - 1];
  const now = prev ? prev.depart : plan.startMin;
  const pos = prev ? prev.unit.coord : startCoord(data, input.startPoint);
  const home = startCoord(data, input.startPoint);
  const used = new Set(plan.stops.map((s) => s.unit.id));
  const out: Alternate[] = [];
  for (const { unit, place } of allUnits(data)) {
    if (used.has(unit.id) || input.exclude?.includes(unit.id)) continue;
    if (!guardrail(place, input.date, input.counts).ok) continue; // FR-AL-02, FR-GR-02
    if (place.tags.some((t) => input.profile.dislikes.includes(t))) continue;
    const w = windowFor(data, unit, input.date);
    if (!w) continue;
    const o = { modes: input.modes, walking: input.profile.walking, budget: input.profile.budget, people: people(input.group) };
    const leg = makeLeg(data, pos, unit.coord, { ...o, insideFort: !!prev?.place.insideFort && place.insideFort });
    const visit = visitMinutes(unit, input.profile.pace);
    const arrive = Math.max(now + leg.minutes + leg.buffer, w.open);
    if (arrive > latestArrival(w, visit)) continue;
    const depart = arrive + TICKET_BUFFER + visit;
    const back = input.returnToStart ? makeLeg(data, unit.coord, home, { ...o, insideFort: false }) : null;
    if (depart + (back ? back.minutes + back.buffer : 0) > plan.endMin) continue; // fits the remaining time
    const c = checkUnit(data, unit, input.date, { arrival: arrive, pace: input.profile.pace, payment: input.payment });
    if (c.verdict === 'not') continue; // feasible now
    out.push({ unit, place, travel: leg.minutes + leg.buffer, match: score(place, input.profile.likes), arrive, verdict: c.verdict });
  }
  // FR-AL-03: rank by interest match, then travel time.
  out.sort((a, b) => b.match - a.match || a.travel - b.travel || a.unit.id.localeCompare(b.unit.id));
  return out.slice(0, 3);
}

/** Replace stop `index` with an alternate (or drop it) and re-time the rest. */
export function replan(data: Data, plan: Plan, index: number, alt: Alternate | null): Plan {
  const dropped = plan.stops[index].unit.id;
  const seq = plan.stops.map((s) => ({ unit: s.unit, place: s.place }));
  seq.splice(index, 1, ...(alt ? [{ unit: alt.unit, place: alt.place }] : []));
  const input = { ...plan.input, exclude: [...(plan.input.exclude ?? []), dropped] };
  return timeSequence(data, input, seq);
}
