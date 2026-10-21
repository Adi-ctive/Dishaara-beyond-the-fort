import { buildPlan, checkUnit, findAlternates, fmt, guardrail, isUnavailable, namedPlaces, promotable, toMin, type Data, type Fact, type Mode, type Place, type Plan, type Profile, type Counts, type Who } from '../core';
import type { T } from '../i18n';

// Tools the assistant may call (FR-AI-02). They run the same deterministic core as the rest of the app;
// the guardrail is applied here, before any place reaches the model (FR-AI-03).

export interface Ctx { data: Data; today: string; profile: Profile; counts: Counts; tr: T; lastPlan: Plan | null; added?: string[] }

/** Places the visitor named (FR-AI-12 uses this to tell named from volunteered places). */
export const findPlaces = (data: Data, text: string) => namedPlaces(data, text);

const fact = (f: Fact | undefined, tr: T) =>
  !f || (isUnavailable(f) || (f.v === null && !f.t)) ? { value: 'unavailable', reason: tr.l(f?.why) || undefined } : { value: tr.l(f.t), label: f.s, verified: f.ver };

function briefing(p: Place, ctx: Ctx) {
  const tr = ctx.tr;
  return {
    id: p.id, name: tr.l(p.name), type: tr.l(p.type), lesser_known: p.lesserKnown,
    summary: fact(p.summary, tr), contact: fact(p.contact, tr), accessibility: 'not verified',
    notes: p.notes.map((n) => fact(n, tr)), rules: p.rules.map((r) => ({ kind: r.kind, ...fact(r, tr) })),
    sections: p.units.map((u) => ({
      name: tr.l(u.name), custodian: fact(u.custodian, tr), hours: fact(u.hours, tr), weekly_closure: fact(u.weeklyClosed, tr), last_entry: fact(u.lastEntry, tr),
      fees: u.fees.v ? { label: u.fees.s, verified: u.fees.ver, rows: u.fees.v.rows.map((r) => ({ visitor: tr.l(r.label), ...(r.any !== undefined ? { price: r.any ?? 'unavailable' } : { cash: r.cash ?? 'unavailable', online: r.online ?? 'unavailable' }) })) } : fact(u.fees, tr),
      payment: fact(u.payment, tr), minimum_visit_min: u.minVisit.v, visit_label: u.minVisit.s,
    })),
  };
}

export function feasibility(p: Place, date: string, ctx: Ctx, arrival?: string) {
  return p.units.map((u) => {
    const r = checkUnit(ctx.data, u, date, { arrival: arrival ? toMin(arrival) : undefined, pace: ctx.profile.pace });
    return { section: ctx.tr.l(u.name), date, verdict: ctx.tr.t(`v_${r.verdict}`), reasons: r.reasons.map((x) => reasonText(x, ctx.tr)) };
  });
}

function reasonText(r: { code: string; p?: Record<string, string | number> }, tr: T) {
  const p = { ...r.p } as Record<string, string | number>;
  if (typeof p.dow === 'number') p.dow = tr.dow(p.dow);
  for (const k of ['latest', 'open']) if (typeof p[k] === 'number') p[k] = fmt(p[k] as number);
  if (p.field) p.field = tr.field(String(p.field));
  return tr.t(`r_${r.code}` as never, p);
}

export interface PlanArgs { date: string; start_time?: string; hours: number; start_point?: string; return_to_start?: boolean; modes?: Mode[]; group_indian?: number; group_foreign?: number; group_children?: number; payment?: 'cash' | 'online' }

export function makePlan(args: PlanArgs, ctx: Ctx): Plan {
  const group: Record<Who, number> = { indian: args.group_indian ?? (args.group_foreign ? 0 : 2), foreign: args.group_foreign ?? 0, child: args.group_children ?? 0 };
  return buildPlan(ctx.data, {
    date: args.date, start: args.start_time || '09:00', hours: Math.min(14, Math.max(1, args.hours)),
    startPoint: ctx.data.landmarks.some((l) => l.id === args.start_point) ? args.start_point! : 'station',
    returnToStart: args.return_to_start ?? true, modes: args.modes?.length ? args.modes : ['walk', 'auto', 'cab'],
    group, payment: args.payment ?? 'online', profile: ctx.profile, counts: ctx.counts, added: ctx.added,
  });
}

// Left-out places the model may name: the visitor's own added places and Level 2 places (FR-AI-12).
const sayable = (p: Plan, l: Plan['leftOut'][number]) => !!p.input.added?.includes(l.place.id) || promotable(l.place, p.input.date, p.input.counts);

export const planSummary = (p: Plan, tr: T) => ({
  date: p.input.date, start: fmt(p.startMin), finish: fmt(p.finish), needs_confirmation: p.needsConfirmation,
  budget_rupees: { min: p.budget.total.min, max: p.budget.total.max, partial: p.budget.total.partial },
  stops: p.stops.map((s, i) => ({ n: i + 1, name: tr.l(s.unit.name), arrive: fmt(s.arrive), depart: fmt(s.depart), verdict: tr.t(`v_${s.check.verdict}`), needs_confirmation: s.needsConfirmation, ...(s.added && { label: 'added by visitor, not suggested' }),
    leg: { mode: s.leg.mode, km: s.leg.km, minutes: s.leg.minutes, buffer_min: s.leg.buffer, fare_rupees: s.leg.fare ?? 'unknown', label: 'estimated' } })),
  left_out: p.leftOut.filter((l) => sayable(p, l)).map((l) => ({ name: tr.l(l.unit.name), reason: tr.t(`lo_${l.reason}` as never) })),
});

/** OpenAI-style tool schemas for the LLM. */
export const TOOL_SCHEMAS = [
  { type: 'function', function: { name: 'search_places', description: 'Find Gwalior places. With a query, only places the query names (exact or near name match; interests are not searchable). With no query, only custodian-flagged (Level 2) places, which are the only places you may suggest unasked.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'a place name the visitor gave' }, lesser_known_only: { type: 'boolean' } } } } },
  { type: 'function', function: { name: 'get_place', description: 'Full stamped briefing for one place: hours, fees by visitor type and payment mode, rules, contact.', parameters: { type: 'object', properties: { place_id: { type: 'string' } }, required: ['place_id'] } } },
  { type: 'function', function: { name: 'check_feasibility', description: 'Rules-engine verdict for visiting a place on a date (YYYY-MM-DD), optional arrival time HH:MM.', parameters: { type: 'object', properties: { place_id: { type: 'string' }, date: { type: 'string' }, arrival_time: { type: 'string' } }, required: ['place_id', 'date'] } } },
  { type: 'function', function: { name: 'build_plan', description: 'Build a one-day time-fit plan. Ask the visitor first for any of date, hours or start point that they did not give.', parameters: { type: 'object', properties: {
    date: { type: 'string', description: 'YYYY-MM-DD' }, start_time: { type: 'string', description: 'HH:MM, default 09:00' }, hours: { type: 'number', description: '1 to 14' },
    start_point: { type: 'string', enum: ['station', 'fort', 'jaivilas', 'ghauspura'] }, return_to_start: { type: 'boolean' },
    modes: { type: 'array', items: { type: 'string', enum: ['walk', 'auto', 'cab'] } }, group_indian: { type: 'integer' }, group_foreign: { type: 'integer' }, group_children: { type: 'integer' }, payment: { type: 'string', enum: ['cash', 'online'] },
  }, required: ['date', 'hours'] } } },
  { type: 'function', function: { name: 'find_alternates', description: 'Up to 3 alternates for a stop in the latest plan that the visitor cannot reach.', parameters: { type: 'object', properties: { stop_number: { type: 'integer' } }, required: ['stop_number'] } } },
];

export type ToolOut = { result: unknown; plan?: Plan; placeId?: string; date?: string; placeIds?: string[] };

export function runTool(name: string, args: Record<string, unknown>, ctx: Ctx): ToolOut {
  const place = (id: unknown) => ctx.data.places.find((p) => p.id === id);
  switch (name) {
    case 'search_places': {
      const q = String(args.query ?? '');
      const hits = q ? findPlaces(ctx.data, q) : [];
      // Decision 28: name search only. With no name, only Level 2 places (the discovery list).
      const list = ctx.data.places.filter((p) => (q ? hits.includes(p.id) : promotable(p, ctx.today, ctx.counts))
        && (!args.lesser_known_only || (p.lesserKnown && promotable(p, ctx.today, ctx.counts))));
      const result = list.map((p) => {
        const g = guardrail(p, ctx.today, ctx.counts);
        return g.ok ? { id: p.id, name: ctx.tr.l(p.name), type: ctx.tr.l(p.type), tags: p.tags, lesser_known: p.lesserKnown }
          : hits.includes(p.id) ? { id: p.id, name: ctx.tr.l(p.name), note: `Describe only if asked. Do not recommend or plan: guardrail ${g.reason}.` } : null;
      }).filter(Boolean);
      return { result, placeIds: list.filter((p) => guardrail(p, ctx.today, ctx.counts).ok).map((p) => p.id) };
    }
    case 'get_place': { const p = place(args.place_id); return p ? { result: briefing(p, ctx), placeId: p.id } : { result: 'not in Dishaara' }; }
    case 'check_feasibility': {
      const p = place(args.place_id);
      const date = String(args.date || ctx.today);
      return p ? { result: feasibility(p, date, ctx, args.arrival_time ? String(args.arrival_time) : undefined), placeId: p.id, date } : { result: 'not in Dishaara' };
    }
    case 'build_plan': { const plan = makePlan(args as unknown as PlanArgs, ctx); ctx.lastPlan = plan; return { result: planSummary(plan, ctx.tr), plan }; }
    case 'find_alternates': {
      if (!ctx.lastPlan) return { result: 'no plan yet' };
      const i = Number(args.stop_number) - 1;
      if (!ctx.lastPlan.stops[i]) return { result: 'no such stop' };
      const alts = findAlternates(ctx.data, ctx.lastPlan, i);
      return { result: alts.length ? alts.map((x) => ({ name: ctx.tr.l(x.unit.name), arrive: fmt(x.arrive), travel_min: x.travel, verdict: ctx.tr.t(`v_${x.verdict}` as never) })) : 'none fits the remaining time; offer to drop the stop', plan: ctx.lastPlan };
    }
  }
  return { result: 'unknown tool' };
}
