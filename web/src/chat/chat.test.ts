import { describe, expect, it } from 'vitest';

declare const process: { env: Record<string, string | undefined> };
import { DEFAULT_PROFILE, SEED, groundingCheck, runFreshness } from '../core';
import { makeT } from '../i18n';
import { respondAI, respondLocal, type Slots } from './engine';
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
