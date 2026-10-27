// AI chat on top of our data, in two separate steps (SYSTEM_PLAN section 6):
// 1. retrieve(): the retrieval agent. Plain code reads our records and builds a small pack of facts,
//    each with its label, date and source. The model never touches the data itself.
// 2. writeReply(): the chatbot. Groq gets only the pack, the raahi's personal lines and the rules,
//    and writes one or two short sentences. The cards under the reply still come from code.
// Every time, fee, distance and phone number in the reply must appear in the pack (groundingCheck),
// and it may not name a place the raahi did not ask about (mentionCheck). One rewrite, then the
// plain rule-based answer is shown instead.
import { checkUnit, fmt, groundingCheck, isUnavailable, mentionCheck, namedPlaces, promotable, type Data, type Fact, type Plan } from '../core';
import type { Lang } from '../theme/ThemeProvider';
import { respond, type Reply } from './local';

export const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 15000;

export type Turn = { role: 'user' | 'bot'; text: string };
export type Ctx = { data: Data; today: string; lang: Lang; plan: Plan | null; added: string[]; prompt: string[] };
export type AIResult = Reply & { ai: boolean; note?: 'grounding' | 'error' };

const SURE: Record<string, { en: string; hi: string }> = {
  'officially confirmed': { en: 'officially confirmed', hi: 'आधिकारिक रूप से पुष्ट' },
  'locally verified': { en: 'checked on site', hi: 'मौके पर जाँचा' },
  'recently reported': { en: 'recently reported', hi: 'हाल में बताया गया' },
  estimated: { en: 'an estimate', hi: 'अनुमान' },
  'historical pattern': { en: 'a past pattern', hi: 'पुराना पैटर्न' },
  unverified: { en: 'not verified', hi: 'असत्यापित' },
  'potentially outdated': { en: 'may be outdated', hi: 'पुराना हो सकता है' },
};
const VERDICT: Record<string, { en: string; hi: string }> = {
  good: { en: 'you can go today', hi: 'आज जा सकते हैं' },
  precautions: { en: 'you can go today, with care', hi: 'आज जा सकते हैं, सावधानी से' },
  confirm: { en: 'confirm with the place before going', hi: 'जाने से पहले जगह से पुष्टि करें' },
  not: { en: 'not possible today', hi: 'आज संभव नहीं' },
};

// Plain sentences, not a table: models misread tables of numbers.
const money = (n: number | null | undefined, lang: Lang) => (n === null || n === undefined ? (lang === 'hi' ? 'पता नहीं' : 'not known') : n === 0 ? (lang === 'hi' ? 'मुफ़्त' : 'free') : `₹${n}`);
const feeLine = (r: { label: { en: string; hi: string }; cash?: number | null; online?: number | null; any?: number | null }, lang: Lang) =>
  r.any !== undefined
    ? `${r.label[lang]}: ${money(r.any, lang)}`
    : lang === 'hi'
      ? `${r.label[lang]}: नकद ${money(r.cash, lang)}, ऑनलाइन ${money(r.online, lang)}`
      : `${r.label[lang]}: ${money(r.cash, lang)} cash, ${money(r.online, lang)} online`;

// Sources disagree: the model gets only the advisory, never the disputed values (Priyangi, Fact 2).
const fact = (f: Fact | undefined, lang: Lang, data: Data) =>
  !f || isUnavailable(f)
    ? { value: 'unavailable', why: f?.why?.[lang] ?? 'not on record' }
    : f.s === 'conflicting'
      ? { value: 'not confirmed: sources disagree', advisory: f.why?.[lang] ?? 'Published sources disagree.' }
      : { value: f.t?.[lang] ?? f.v, howSure: f.s ? SURE[f.s]?.[lang] ?? f.s : undefined, date: f.ver, source: f.src ? data.sources[f.src]?.name ?? f.src : undefined };

function placePack(id: string, ctx: Ctx) {
  const { data, today, lang } = ctx;
  const p = data.places.find((x) => x.id === id)!;
  return {
    id,
    name: p.name[lang],
    type: p.type[lang],
    ...(p.sensitive ? { rulesFirst: { dress: fact(p.sensitive.dress, lang, data), worship: fact(p.sensitive.worship, lang, data) } } : {}),
    sections: p.units.map((u) => ({
      name: u.name[lang],
      todaysVerdict: VERDICT[checkUnit(data, u, today).verdict][lang],
      hours: fact(u.hours, lang, data),
      weeklyClosing: fact(u.weeklyClosed, lang, data),
      lastEntry: fact(u.lastEntry, lang, data),
      fees:
        isUnavailable(u.fees) || u.fees.s === 'conflicting'
          ? fact(u.fees, lang, data)
          : { prices: u.fees.v?.rows.map((r) => feeLine(r, lang)), howSure: u.fees.s ? SURE[u.fees.s]?.[lang] : undefined, date: u.fees.ver },
      timeNeededMin: u.minVisit.v,
    })),
    summary: fact(p.summary, lang, data),
    rules: p.rules.map((r) => fact(r, lang, data)),
    accessibility: fact(p.accessibility, lang, data),
    contact: fact(p.contact, lang, data),
  };
}

/** The retrieval agent: what the model may use this turn, and which places it may name. */
export function retrieve(text: string, history: Turn[], ctx: Ctx) {
  const local = respond(text, ctx.data, ctx.today, ctx.lang);
  const ids = new Set<string>(namedPlaces(ctx.data, text));
  for (const c of local.cards) {
    if (c.kind === 'place') ids.add(c.id);
    if (c.kind === 'places') c.ids.forEach((i) => ids.add(i));
  }
  const plan = ctx.plan && {
    stops: ctx.plan.stops.map((s) => ({ name: s.unit.name[ctx.lang], arrive: fmt(s.arrive), leave: fmt(s.depart), verdict: s.check.verdict, addedByRaahi: s.added })),
    backBy: fmt(ctx.plan.finish),
    budgetRupees: { min: ctx.plan.budget.total.min, max: ctx.plan.budget.total.max, partial: ctx.plan.budget.total.partial },
  };
  const pack = {
    today: ctx.today,
    city: ctx.data.city.name[ctx.lang],
    places: [...ids].map((id) => placePack(id, ctx)),
    ...(plan ? { todaysRoadmap: plan } : {}),
    appWillShow: local.cards.map((c) => c.kind),
  };
  const userTexts = [...history.filter((h) => h.role === 'user').map((h) => h.text), text];
  const allowed = new Set<string>([...ids, ...userTexts.flatMap((t) => namedPlaces(ctx.data, t)), ...ctx.added, ...(ctx.plan?.stops.map((s) => s.place.id) ?? [])]);
  for (const p of ctx.data.places) if (promotable(p, ctx.today)) allowed.add(p.id);
  return { local, pack, allowed, userTexts };
}

export function systemPrompt(ctx: Ctx): string {
  return [
    `You are Dishaara, a warm and simple travel helper for ${ctx.data.city.name.en}, India. Today is ${ctx.today}.`,
    'You get a FACTS pack from our checked records. Rules:',
    '1. Use only the FACTS pack. Never use your own memory for hours, fees, dates, history, distances, phone numbers or rules.',
    '2. If a fact is "unavailable", say plainly that we do not know it yet. Never guess.',
    '3. todaysVerdict is decided by rules. Say it in your own words but keep its meaning exactly. Never soften it.',
    '4. If a value is "not confirmed", say so and pass on the advisory. Never give a price or time for it.',
    '5. Say how sure a key fact is with its howSure words and date, for example "officially confirmed on 13 Oct".',
    '6b. If something is unavailable, name what we do not know, in one short sentence.',
    '6. Only talk about places in the pack. Do not name other places.',
    '7. Reply in at most 2 short sentences, under 45 words, plain words. No lists or tables: the app shows cards with the details under your reply.',
    `8. Reply in ${ctx.lang === 'hi' ? 'Hindi (Devanagari script)' : 'English'}.`,
    ctx.prompt.length ? `About this raahi (they wrote or approved these): ${ctx.prompt.join('; ')}.` : 'This raahi has no personal preferences set.',
  ].join('\n');
}

type GroqMsg = { role: 'system' | 'user' | 'assistant'; content: string };

async function groq(key: string, messages: GroqMsg[]): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.2, reasoning_effort: 'low', max_completion_tokens: 600 }),
    });
    if (!r.ok) throw new Error(`Groq ${r.status}`);
    const j = await r.json();
    return String(j.choices?.[0]?.message?.content ?? '').trim();
  } finally {
    clearTimeout(timer);
  }
}

/** One chat turn with the model. Never throws: on any failure the rule-based answer is used. */
export async function respondAI(text: string, history: Turn[], ctx: Ctx, key: string): Promise<AIResult> {
  const { local, pack, allowed, userTexts } = retrieve(text, history, ctx);
  // Emergencies never wait for a model.
  if (local.cards.some((c) => c.kind === 'sos')) return { ...local, ai: false };
  const past: GroqMsg[] = history.slice(-6).map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text }));
  const messages: GroqMsg[] = [
    { role: 'system', content: systemPrompt(ctx) },
    ...past,
    { role: 'user', content: `FACTS: ${JSON.stringify(pack)}\n\nRaahi asks: ${text}` },
  ];
  const sources = [pack, userTexts, ctx.today];
  const verify = (a: string) => {
    const g = groundingCheck(a, sources);
    const m = mentionCheck(ctx.data, a, allowed);
    const names = m.extra.map((id) => ctx.data.places.find((p) => p.id === id)!.name.en);
    return { ok: !!a && g.ok && m.ok, fix: [...(g.ok ? [] : [`values not in FACTS: ${g.missing.join(', ')}`]), ...(m.ok ? [] : [`places not in FACTS: ${names.join(', ')}`])] };
  };
  try {
    let answer = await groq(key, messages);
    let check = verify(answer);
    if (!check.ok && answer) {
      messages.push({ role: 'assistant', content: answer }, { role: 'user', content: `Your reply used ${check.fix.join(' and ')}. Rewrite it using only FACTS.` });
      answer = await groq(key, messages);
      check = verify(answer);
    }
    if (!check.ok) return { ...local, ai: false, note: 'grounding' };
    return { ...local, text: answer, ai: true };
  } catch {
    return { ...local, ai: false, note: 'error' };
  }
}

// The key lives only in this browser, typed by whoever runs the demo. It is never bundled or committed.
// On the event day the backend holds the key and the browser calls Pranjal's /chat instead.
const KEY = 'dishaara.groqKey';
export function getKey(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}
export function setKey(k: string) {
  try {
    if (k) localStorage.setItem(KEY, k.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: AI stays off */
  }
}
