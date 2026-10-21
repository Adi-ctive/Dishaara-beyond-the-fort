import { afterEach, describe, expect, it, vi } from 'vitest';

declare const process: { env: Record<string, string | undefined> };
import { DEFAULT_PROFILE, SEED, groundingCheck, namedPlaces, runFreshness } from '../core';
import { makeT } from '../i18n';
import { allowedPlaces, respondAI, respondLocal, type Msg, type Slots } from './engine';
import type { Ctx } from './tools';

const TODAY = '2026-10-14';
const ctx = (lang: 'en' | 'hi' = 'en'): Ctx => ({ data: runFreshness(SEED, TODAY).data, today: TODAY, profile: { ...DEFAULT_PROFILE }, counts: {}, tr: makeT(lang), lastPlan: null });

describe('chat without AI (E7, AT-13)', () => {
  it('fills date, hours and start point one question at a time, then builds a plan', () => {
    const c = ctx();
    let slots: Slots = {};
    let r = respondLocal('Plan my day in Gwalior', c, slots);
    expect(r.slots.awaiting).toBe('date');
    r = respondLocal('2026-10-21', c, (slots = r.slots));
    expect(r.slots.awaiting).toBe('hours');
    r = respondLocal('5', c, (slots = r.slots));
    expect(r.slots.awaiting).toBe('startPoint');
    r = respondLocal('Gwalior Railway Station', c, (slots = r.slots));
    const card = r.msg.cards[0];
    expect(card.kind).toBe('plan');
    if (card.kind === 'plan') expect(card.plan.finish - card.plan.startMin).toBeLessThanOrEqual(300);
  });
  it('AT-16: asks which date when weekday and date disagree', () => {
    const r = respondLocal('free next Sunday 20 November, 6 hours from noon, starting at the station', ctx(), {});
    expect(r.msg.chips.map((x) => x.send)).toEqual(['2026-11-20', '2026-11-22']);
    expect(r.slots.hours).toBe(6);
  });
  it('AT-17: uncovered city', () => {
    expect(respondLocal('plan a day in Agra', ctx(), {}).msg.cards[0].kind).toBe('notCovered');
  });
  it('place question returns a verdict card for the date', () => {
    const r = respondLocal('Is Jai Vilas open tomorrow?', ctx(), {});
    expect(r.msg.cards[0]).toEqual({ kind: 'place', placeId: 'jai-vilas', date: '2026-10-15' });
  });
  it('Hindi works the same way', () => {
    const r = respondLocal('ग्वालियर में मेरा दिन प्लान करें', ctx('hi'), {});
    expect(r.slots.awaiting).toBe('date');
  });
});

describe('AT-10 grounding check (FR-AI-04)', () => {
  const tools = [{ hours: '10:00–18:00', fee: 350, stops: [{ arrive: '09:21' }], km: 2.2, date: '2026-11-22' }];
  it('blocks a time, fee or distance not in tool results', () => {
    expect(groundingCheck('Opens at 08:15, costs ₹99', tools).ok).toBe(false);
    expect(groundingCheck('It is 7 km away', tools).ok).toBe(false);
  });
  it('accepts values that are in tool results', () => {
    expect(groundingCheck('Open 10:00 to 18:00, ₹350, first stop 9:21, 2.2 km, on 22 Nov', tools)).toEqual({ ok: true, missing: [] });
  });
});

describe('AT-23 leak fix 3: the assistant does not volunteer unflagged places (FR-AI-12)', () => {
  const W = ['tansen-tomb', 'ghaus-tomb', 'gurudwara-data-bandi-chhod', 'sun-temple', 'suraj-kund']; // not plan-eligible, no Level 2 flag
  const REQUESTS = [
    'what else is near here?', 'what else is nearby the fort?', 'Show me something lesser-known', 'hidden gems please', 'any music places?',
    'temples to see', 'something spiritual', 'where should I go next?', 'hi', 'help',
    'Is Gwalior Fort open tomorrow?', 'How much is the fort ticket?', 'Jai Vilas fees', 'what can I see after Jai Vilas?', 'is it open on sunday',
    'plan 5 hours tomorrow starting at the station', 'plan 8 hours on 2026-10-21 from the fort', 'plan 3 hours tomorrow from ghauspura',
    'Plan my day in Gwalior', 'start over',
  ];
  const mentions = (m: ReturnType<typeof respondLocal>['msg'], c: Ctx) => {
    const ids = new Set(namedPlaces(c.data, [m.text, ...m.chips.map((x) => x.label)].join(' ')));
    for (const card of m.cards) {
      if (card.kind === 'place') ids.add(card.placeId);
      if (card.kind === 'places') card.ids.forEach((id) => ids.add(id));
      if (card.kind === 'plan') [...card.plan.stops.map((s) => s.place.id), ...card.plan.leftOut.map((l) => l.place.id)].forEach((id) => ids.add(id));
    }
    return [...ids].filter((id) => W.includes(id));
  };
  it('20 requests that do not name W mention W 0 times (text, chips and cards)', () => {
    const c = ctx();
    c.profile = { ...DEFAULT_PROFILE, likes: ['music', 'spiritual', 'temples'] }; // interests that would pull W in if the guard leaked
    let seen: string[] = [];
    let slots: Slots = {};
    for (const q of REQUESTS) {
      const r = respondLocal(q, c, slots);
      seen = seen.concat(mentions(r.msg, c));
      slots = r.slots;
      for (const follow of ['2026-10-21', '6', 'Gwalior Railway Station']) if (slots.awaiting) { const f = respondLocal(follow, c, slots); seen = seen.concat(mentions(f.msg, c)); slots = f.slots; }
    }
    expect(seen).toEqual([]);
  });
  it('when the visitor names W, the assistant answers from W\'s record', () => {
    const r = respondLocal('Tell me about the Tomb of Tansen', ctx(), {});
    expect(r.msg.cards[0]).toMatchObject({ kind: 'place', placeId: 'tansen-tomb' });
  });
  it('allowed places: named by the visitor, plan stops, added places and Level 2 only', () => {
    const c = ctx();
    expect(allowedPlaces(c, ['what else is near here?'], []).has('tansen-tomb')).toBe(false);
    expect(allowedPlaces(c, ['is the tansen tomb open?'], []).has('tansen-tomb')).toBe(true);
    expect(allowedPlaces({ ...c, added: ['tansen-tomb'] }, ['plan my day'], []).has('tansen-tomb')).toBe(true);
    expect(allowedPlaces(c, ['hi'], []).has('teli-ka-mandir')).toBe(true); // Level 2
  });
});

describe('AT-23 with the AI path: a reply that volunteers W is regenerated, then falls back (FR-AI-12)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const groqReplies = (...texts: string[]) => {
    let i = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content: texts[Math.min(i++, texts.length - 1)] } }] }) })));
  };
  const history: Msg[] = [];
  it('regenerates once when the reply names an unflagged place the visitor did not name', async () => {
    groqReplies('You could also visit the Tomb of Tansen nearby.', 'Ask me about any place by name, or I can plan your day.');
    const r = await respondAI('what else is near here?', history, ctx(), {}, 'test-key');
    expect(r.msg.ai).toBe(true);
    expect(namedPlaces(ctx().data, r.msg.text)).toEqual([]);
  });
  it('falls back to the structured answer when the rewrite still names it', async () => {
    groqReplies('Try the Tomb of Tansen.', 'Really, the Tansen tomb is lovely.');
    const r = await respondAI('what else is near here?', history, ctx(), {}, 'test-key');
    expect(r.msg.ai).toBeUndefined();
    expect(r.msg.note).toBe('grounding');
    expect(r.msg.text).not.toMatch(/tansen/i);
  });
  it('lets the reply name W when the visitor asked about it', async () => {
    groqReplies('The Tomb of Tansen is an ASI monument at Ghauspura.');
    const r = await respondAI('Tell me about Tansen tomb', history, ctx(), {}, 'test-key');
    expect(r.msg.ai).toBe(true);
  });
});

// Live check against Groq. Runs only when GROQ_KEY is set in the shell; never in CI.
describe.skipIf(!process.env.GROQ_KEY)('Groq live', () => {
  it('answers a place question with tool calls and a grounded reply', async () => {
    const c = ctx();
    const r = await respondAI('Is Jai Vilas Palace open on 2026-10-21 and what does it cost?', [], c, {}, process.env.GROQ_KEY!);
    console.log('AI:', r.msg.text, '| ai:', r.msg.ai, '| cards:', r.msg.cards.map((x) => x.kind));
    expect(r.msg.cards.length).toBeGreaterThan(0);
  }, 60000);
  it('builds a plan through build_plan', async () => {
    const c = ctx();
    const r = await respondAI('Plan 5 hours on 2026-10-21 starting at the railway station at 10:00', [], c, {}, process.env.GROQ_KEY!);
    console.log('AI:', r.msg.text, '| ai:', r.msg.ai, '| cards:', r.msg.cards.map((x) => x.kind));
    expect(r.msg.cards[0]?.kind).toBe('plan');
  }, 60000);
});
