import { groundingCheck, mentionCheck, namedPlaces, parseTrip, promotable, type Plan } from '../core';
import { findPlaces, makePlan, runTool, TOOL_SCHEMAS, type Ctx, type ToolOut } from './tools';

// Chat engine. Deterministic guards run first (coverage E20, emergency E18, date/weekday E19).
// With a Groq key the model talks and calls tools; without one, or if it fails (E7), a rule-based
// writer answers from the same tools. Either way the cards come from tool results, not from the model.

export type Card = { kind: 'plan'; plan: Plan } | { kind: 'place'; placeId: string; date: string } | { kind: 'places'; ids: string[] } | { kind: 'notCovered' } | { kind: 'emergency' };
export interface Quick { label: string; send: string }
export interface BotMsg { role: 'bot'; text: string; ai?: boolean; cards: Card[]; chips: Quick[]; note?: string }
export interface UserMsg { role: 'user'; text: string }
export type Msg = BotMsg | UserMsg;
export interface Slots { active?: boolean; awaiting?: 'date' | 'hours' | 'startPoint'; date?: string; hours?: number; start?: string; startPoint?: string }

export const GROQ_MODEL = 'openai/gpt-oss-120b';
const PLAN_WORDS = /\bplan|itinerar|\btrip\b|day out|\bfree\b|spend|\bhours?\b|घंटे|घंटा|योजना|घूम|यात्रा|प्लान/;
const LESSER = /lesser|hidden|offbeat|less known|less-known|unusual|कम प्रसिद्ध|अनजान|छुपे/;
const EMERGENCY = /emergency|ambulance|police|hospital|injur|accident|lost child|आपात|एम्बुलेंस|पुलिस|अस्पताल/;
const RESET = /start over|reset|new plan|नया|फिर से/;

const istNow = () => new Date(Date.now() + 5.5 * 3600000);
const shift = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nextDow = (iso: string, dow: number) => shift(iso, ((dow - new Date(iso + 'T00:00:00Z').getUTCDay() + 7) % 7) || 7);

function defaultStart(date: string, today: string) {
  if (date !== today) return '09:00';
  const n = istNow();
  const m = Math.max(9 * 60, Math.ceil((n.getUTCHours() * 60 + n.getUTCMinutes()) / 30) * 30);
  return m > 20 * 60 ? '09:00' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function suggestions(ctx: Ctx): Quick[] {
  const t = ctx.tr.t;
  return [
    { label: t('c_s1'), send: t('c_s1') },
    { label: t('c_s2'), send: t('c_s2') },
    { label: t('c_s3'), send: t('c_s3') },
    { label: t('c_s4'), send: t('c_s4') },
  ];
}

/** Guards that never go to the model. */
function guards(text: string, ctx: Ctx, slots: Slots): { msg: BotMsg; slots: Slots } | null {
  const t = ctx.tr.t;
  const s = text.toLowerCase();
  const parsed = parseTrip(text, ctx.today);
  if (parsed.uncoveredCity) return { msg: { role: 'bot', text: t('c_notCovered'), cards: [{ kind: 'notCovered' }], chips: suggestions(ctx) }, slots: {} };
  if (EMERGENCY.test(s)) return { msg: { role: 'bot', text: t('c_emergency'), cards: [{ kind: 'emergency' }], chips: [] }, slots };
  if (parsed.mismatch) {
    const mm = parsed.mismatch;
    const next: Slots = { ...slots, active: true, awaiting: 'date', hours: parsed.hours ?? slots.hours, start: parsed.start ?? slots.start, startPoint: parsed.startPoint ?? slots.startPoint };
    return {
      msg: { role: 'bot', text: t('askDate', { date: ctx.tr.date(mm.date), actual: ctx.tr.dow(mm.actual), opt1: ctx.tr.dateDow(mm.options[0]), opt2: ctx.tr.dateDow(mm.options[1]) }),
        cards: [], chips: mm.options.map((o) => ({ label: ctx.tr.dateDow(o), send: o })) },
      slots: next,
    };
  }
  return null;
}

/** Rule-based assistant: slot-filling planner, place answers, discovery. Works with no AI at all. */
export function respondLocal(text: string, ctx: Ctx, slots: Slots): { msg: BotMsg; slots: Slots } {
  const g = guards(text, ctx, slots);
  if (g) return g;
  const t = ctx.tr.t;
  const s = text.toLowerCase();
  if (RESET.test(s)) slots = {};
  const parsed = parseTrip(text, ctx.today);
  if (slots.awaiting === 'hours' && /^\s*\d{1,2}(\.\d)?\s*$/.test(s)) parsed.hours = Math.min(14, Math.max(1, +s));
  const places = findPlaces(ctx.data, text);
  const planish = slots.active || PLAN_WORDS.test(s) || parsed.hours !== undefined;

  if (LESSER.test(s) && !slots.active) {
    // Discovery lists are Level 2 only (Decision 25).
    const ids = ctx.data.places.filter((p) => p.lesserKnown && promotable(p, ctx.today, ctx.counts)).map((p) => p.id);
    return { msg: { role: 'bot', text: t(ids.length ? 'c_lesser' : 'c_lesserNone'), cards: ids.length ? [{ kind: 'places', ids }] : [], chips: [{ label: t('c_s1'), send: t('c_s1') }] }, slots };
  }

  if (places.length && !(planish && (slots.active || /\bplan|योजना|प्लान/.test(s)))) {
    const date = parsed.date ?? ctx.today;
    const names = places.map((id) => ctx.tr.l(ctx.data.places.find((p) => p.id === id)!.name)).join(', ');
    return {
      msg: { role: 'bot', text: t('c_place', { names, date: ctx.tr.dateDow(date) }), cards: places.slice(0, 2).map((placeId) => ({ kind: 'place', placeId, date })),
        chips: [{ label: t('c_s1'), send: t('c_s1') }, { label: t('c_s4'), send: t('c_s4') }] },
      slots,
    };
  }

  if (planish) {
    const next: Slots = { ...slots, active: true };
    if (parsed.date) next.date = parsed.date;
    if (parsed.hours) next.hours = parsed.hours;
    if (parsed.start) next.start = parsed.start;
    if (parsed.startPoint && (slots.awaiting === 'startPoint' || /start|from|से/.test(s))) next.startPoint = parsed.startPoint;
    if (!next.date) {
      next.awaiting = 'date';
      const tm = shift(ctx.today, 1);
      return { msg: { role: 'bot', text: t('c_askDate'), cards: [], chips: [
        { label: t('c_today'), send: ctx.today }, { label: t('c_tomorrow'), send: tm },
        { label: ctx.tr.dateDow(nextDow(ctx.today, 6)), send: nextDow(ctx.today, 6) }, { label: ctx.tr.dateDow(nextDow(ctx.today, 0)), send: nextDow(ctx.today, 0) },
      ] }, slots: next };
    }
    if (!next.hours) {
      next.awaiting = 'hours';
      return { msg: { role: 'bot', text: t('c_askHours', { date: ctx.tr.dateDow(next.date) }), cards: [], chips: [3, 5, 8].map((h) => ({ label: t('c_hoursN', { n: h }), send: t('c_hoursN', { n: h }) })) }, slots: next };
    }
    if (!next.startPoint) {
      next.awaiting = 'startPoint';
      return { msg: { role: 'bot', text: t('c_askStart'), cards: [], chips: ctx.data.landmarks.map((l) => ({ label: ctx.tr.l(l.name), send: ctx.tr.l(l.name) })) }, slots: next };
    }
    const plan = makePlan({ date: next.date, hours: next.hours, start_time: next.start ?? defaultStart(next.date, ctx.today), start_point: next.startPoint }, ctx);
    ctx.lastPlan = plan;
    const text2 = plan.stops.length
      ? t('c_planReady', { n: plan.stops.length, date: ctx.tr.dateDow(plan.input.date), start: plan.input.start, names: plan.stops.map((x) => ctx.tr.l(x.unit.name)).join(', ') })
      : t('emptyPlan');
    return { msg: { role: 'bot', text: text2, cards: [{ kind: 'plan', plan }], chips: [{ label: t('c_s3'), send: t('c_s3') }, { label: t('c_startOver'), send: t('c_startOver') }] }, slots: {} };
  }

  return { msg: { role: 'bot', text: t('c_help'), cards: [], chips: suggestions(ctx) }, slots };
}

function cardsFrom(outs: ToolOut[]): Card[] {
  const plan = [...outs].reverse().find((o) => o.plan)?.plan;
  if (plan) return [{ kind: 'plan', plan }];
  const seen = new Map<string, string>();
  for (const o of outs) if (o.placeId && !seen.has(o.placeId)) seen.set(o.placeId, o.date ?? '');
  if (seen.size) return [...seen].slice(0, 2).map(([placeId, date]) => ({ kind: 'place', placeId, date }));
  const ids = outs.find((o) => o.placeIds?.length)?.placeIds;
  return ids ? [{ kind: 'places', ids }] : [];
}

interface GroqMsg { role: string; content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string }

async function groq(key: string, messages: GroqMsg[], withTools: boolean): Promise<GroqMsg> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000); // E7: slower than 15 s → structured fallback
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.2, reasoning_effort: 'low', ...(withTools ? { tools: TOOL_SCHEMAS, tool_choice: 'auto' } : {}) }),
    });
    if (!r.ok) throw new Error(`Groq ${r.status}`);
    return (await r.json()).choices[0].message as GroqMsg;
  } finally { clearTimeout(timer); }
}

function system(ctx: Ctx): string {
  const p = ctx.profile;
  return [
    `You are Dishaara, a warm, simple trip helper for Gwalior, India. Today is ${ctx.today} (${ctx.tr.dow(new Date(ctx.today + 'T00:00:00Z').getUTCDay())}).`,
    'Rules you must follow:',
    '1. Use only facts from tool results. Never use your own memory for hours, fees, dates, history, distances, phone numbers or accessibility.',
    '2. If a fact is "unavailable", say so plainly and give the official contact if a tool returned one. Never estimate it.',
    '3. Visit verdicts come only from check_feasibility. Repeat them exactly; never soften or change them.',
    '4. After a key fact, put its status label in brackets, for example: ₹25 cash [officially confirmed].',
    '5. Only Gwalior is covered. For any other city say "Not covered yet".',
    '6. Before build_plan you need the date, the number of hours and the start point (station, fort, jaivilas or ghauspura). If one is missing, ask one short question.',
    '7. Never recommend or plan places that tools mark as not plan-eligible; only promote lesser-known places that search_places returns with lesser_known_only.',
    '8. Never name a place the visitor did not name, unless it is a stop in a plan you built or search_places returned it with no query. If asked "what else is nearby?", call search_places with no query.',
    '9. Keep replies under 80 words, friendly and plain. No tables or long lists: the app shows cards with the full details under your reply.',
    `10. Reply in ${ctx.tr.lang === 'hi' ? 'Hindi (Devanagari script)' : 'English'}.`,
    `Visitor profile: likes ${p.likes.join(', ') || 'none set'}; dislikes ${p.dislikes.join(', ') || 'none'}; pace ${p.pace}; walking ${p.walking}; budget ${p.budget}.`,
  ].join('\n');
}

/** Places the assistant may name this turn (FR-AI-12). */
export function allowedPlaces(ctx: Ctx, userTexts: string[], outs: ToolOut[]): Set<string> {
  const ok = new Set<string>(userTexts.flatMap((t) => namedPlaces(ctx.data, t)));
  for (const o of outs) for (const s of o.plan?.stops ?? []) ok.add(s.place.id);
  for (const s of ctx.lastPlan?.stops ?? []) ok.add(s.place.id);
  for (const id of ctx.added ?? []) ok.add(id);
  for (const l of ctx.data.landmarks) for (const id of namedPlaces(ctx.data, ctx.tr.l(l.name))) ok.add(id);
  for (const p of ctx.data.places) if (promotable(p, ctx.today, ctx.counts)) ok.add(p.id);
  return ok;
}

/** Model-led turn with tool calls and the grounding check (FR-AI-02/04). Throws if Groq fails. */
export async function respondAI(text: string, history: Msg[], ctx: Ctx, slots: Slots, key: string): Promise<{ msg: BotMsg; slots: Slots }> {
  const g = guards(text, ctx, slots);
  if (g) return g;
  const past: GroqMsg[] = history.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  const messages: GroqMsg[] = [{ role: 'system', content: system(ctx) }, ...past, { role: 'user', content: text }];
  const outs: ToolOut[] = [];
  let answer = '';
  for (let i = 0; i < 5; i++) {
    const m = await groq(key, messages, true);
    if (m.tool_calls?.length) {
      messages.push({ role: 'assistant', content: m.content ?? '', tool_calls: m.tool_calls });
      for (const c of m.tool_calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(c.function.arguments || '{}'); } catch { /* bad args → empty */ }
        const out = runTool(c.function.name, args, ctx);
        outs.push(out);
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out.result) });
      }
      continue;
    }
    answer = (m.content ?? '').trim();
    break;
  }
  const userTexts = [...history.filter((h) => h.role === 'user').map((h) => h.text), text];
  const sources = [outs.map((o) => o.result), userTexts, ctx.today];
  const allowed = allowedPlaces(ctx, userTexts, outs);
  const verify = (a: string) => {
    const g = groundingCheck(a, sources);
    const m = mentionCheck(ctx.data, a, allowed); // FR-AI-12: no unflagged place the visitor did not name
    return { ok: g.ok && m.ok, missing: [...g.missing, ...m.extra.map((id) => `place:${id}`)], fix: [
      ...(g.ok ? [] : [`values that are not in the tool results: ${g.missing.join(', ')}`]),
      ...(m.ok ? [] : [`places the visitor did not ask about: ${m.extra.map((id) => ctx.tr.l(ctx.data.places.find((p) => p.id === id)!.name)).join(', ')}`]),
    ] };
  };
  let check = verify(answer);
  if (answer && !check.ok) { // regenerate once
    messages.push({ role: 'assistant', content: answer }, { role: 'user', content: `Your reply used ${check.fix.join(' and ')}. Rewrite it without them, using only the tool results.` });
    answer = ((await groq(key, messages, false)).content ?? '').trim();
    check = verify(answer);
  }
  const cards = cardsFrom(outs);
  if (!answer || !check.ok) {
    console.info('[dishaara] grounding failed', check.missing); // FR-AI-09 audit (local only)
    return { msg: { role: 'bot', text: ctx.tr.t('c_aiFailed'), cards, chips: suggestions(ctx), note: 'grounding' }, slots };
  }
  return { msg: { role: 'bot', text: answer, ai: true, cards, chips: cards.some((c) => c.kind === 'plan') ? [{ label: ctx.tr.t('c_s3'), send: ctx.tr.t('c_s3') }] : [] }, slots };
}
