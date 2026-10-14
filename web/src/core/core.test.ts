import { describe, expect, it } from 'vitest';
import {
  SEED, allUnits, buildPlan, checkUnit, findAlternates, latestArrival, parseTrip, runFreshness, isCovered,
  visitMinutes, windowFor, withGuardrails, type Mode, type PlanInput, type Plan, DEFAULT_PROFILE,
} from './index';

const TODAY = '2026-10-14'; // Wednesday
const { data: DATA } = runFreshness(SEED, TODAY);
const unit = (id: string) => allUnits(DATA).find((u) => u.unit.id === id)!;

const base = (o: Partial<PlanInput> = {}): PlanInput => ({
  date: '2026-10-21', start: '09:00', hours: 8, startPoint: 'station', returnToStart: true,
  modes: ['walk', 'auto', 'cab'], group: { indian: 2, foreign: 0, child: 0 }, payment: 'online',
  profile: { ...DEFAULT_PROFILE }, ...o,
});

// 50 varied inputs over the test set (AT-01, AT-02)
const VARIED: PlanInput[] = Array.from({ length: 50 }, (_, i) => base({
  date: `2026-10-${String(15 + (i % 14)).padStart(2, '0')}`,
  start: ['06:30', '08:00', '09:30', '11:00', '12:00', '14:00', '15:30'][i % 7],
  hours: 1 + (i % 14),
  startPoint: ['station', 'fort', 'jaivilas', 'ghauspura'][i % 4],
  returnToStart: i % 3 !== 0,
  modes: ([['walk', 'auto', 'cab'], ['cab'], ['auto', 'walk'], ['walk']] as Mode[][])[i % 4],
  profile: { ...DEFAULT_PROFILE, pace: (['relaxed', 'normal', 'fast'] as const)[i % 3], likes: [['temples'], ['royal', 'museums'], [], ['music']][i % 4] },
}));
const PLANS = VARIED.map((v) => buildPlan(DATA, v));

describe('AT-01 plans respect hours and last entry (FR-PL-02)', () => {
  it('0 stops before opening, after last entry, or ending after closing', () => {
    let n = 0;
    for (const p of PLANS) for (const s of p.stops) {
      const w = windowFor(DATA, s.unit, p.input.date)!;
      expect(s.arrive).toBeGreaterThanOrEqual(w.open);
      expect(s.arrive).toBeLessThanOrEqual(latestArrival(w, visitMinutes(s.unit, p.input.profile.pace)));
      expect(s.depart).toBeLessThanOrEqual(w.close);
      n++;
    }
    expect(n).toBeGreaterThan(50);
  });
  it('every leg has a buffer of max(15, 20%) (FR-PL-03)', () => {
    for (const p of PLANS) for (const s of p.stops) expect(s.leg.buffer).toBe(Math.max(15, Math.round(s.leg.minutes * 0.2)));
  });
  it('same inputs give the same plan (FR-PL-08)', () => {
    expect(JSON.stringify(buildPlan(DATA, VARIED[7]))).toBe(JSON.stringify(PLANS[7]));
  });
});

describe('AT-02 plans fit the time budget (FR-PL-04)', () => {
  it('total time incl. return ≤ hours available', () => {
    for (const p of PLANS) expect(p.finish - p.startMin).toBeLessThanOrEqual(p.input.hours * 60);
  });
});

describe('AT-04 stale fact is flagged (FR-VF-05, FR-PL-07)', () => {
  it('check_by yesterday → potentially outdated, queued, plan needs confirmation', () => {
    const d = JSON.parse(JSON.stringify(SEED));
    const jv = d.places.find((p: { id: string }) => p.id === 'jai-vilas').units[0];
    jv.hours.ver = '2026-07-15'; // + 90 days = 13 Oct 2026 = yesterday
    const { data, queue } = runFreshness(d, TODAY);
    const h = data.places.find((p) => p.id === 'jai-vilas')!.units[0].hours;
    expect(h.s).toBe('potentially outdated');
    expect(queue.some((q) => q.kind === 'stale' && q.placeId === 'jai-vilas' && q.path.includes('hours'))).toBe(true);
    const plan = buildPlan(data, base({ profile: { ...DEFAULT_PROFILE, likes: ['royal'] }, start: '10:00', startPoint: 'jaivilas' }));
    const stop = plan.stops.find((s) => s.unit.id === 'jai-vilas')!;
    expect(stop.needsConfirmation).toBe(true);
    expect(plan.needsConfirmation).toBe(true);
  });
  it('fresh custodian hours stay confirmed', () => {
    expect(unit('jai-vilas').unit.hours.s).toBe('officially confirmed');
    expect(unit('fort-gujari').unit.hours.s).toBe('potentially outdated'); // MP Tourism page of 31 Oct 2023
  });
});

describe('AT-06 guardrail: unflagged place never promoted (FR-GR-02/03)', () => {
  it('X without visitor-ready flag appears 0 times in 30 plans and 30 alternate requests', () => {
    const d = withGuardrails(DATA, { 'tansen-tomb': { visitorReady: false } });
    const like = { ...DEFAULT_PROFILE, likes: ['music'] };
    let seen = 0;
    for (let i = 0; i < 30; i++) {
      const p = buildPlan(d, base({ profile: like, startPoint: 'ghauspura', start: ['08:00', '10:00', '13:00'][i % 3], hours: 2 + (i % 10) }));
      seen += p.stops.filter((s) => s.place.id === 'tansen-tomb').length;
      if (p.stops.length) seen += findAlternates(d, p, i % p.stops.length).filter((a) => a.place.id === 'tansen-tomb').length;
    }
    expect(seen).toBe(0);
    expect(d.places.some((p) => p.id === 'tansen-tomb')).toBe(true); // still viewable by search
  });
});

describe('AT-07 guardrail: daily limit (FR-GR-04)', () => {
  it('Teli ka Mandir (limit 2, demo value) is excluded from the third plan that date', () => {
    const inp = base({ profile: { ...DEFAULT_PROFILE, likes: ['temples'] }, startPoint: 'fort' });
    expect(buildPlan(DATA, inp).stops.some((s) => s.place.id === 'teli-ka-mandir')).toBe(true);
    const third = buildPlan(DATA, { ...inp, counts: { [inp.date]: { 'teli-ka-mandir': 2 } } });
    expect(third.stops.some((s) => s.place.id === 'teli-ka-mandir')).toBe(false);
  });
});

describe('AT-08 closed place → not feasible + alternates (FR-FC-01, FR-AL-01/02)', () => {
  it('Gujari Mahal on its weekly holiday (Monday) is not feasible, with a reason', () => {
    const r = checkUnit(DATA, unit('fort-gujari').unit, '2026-10-19');
    expect(r.verdict).toBe('not');
    expect(r.reasons[0].code).toBe('weeklyClosed');
  });
  it('a stop marked unreachable gets ≤ 3 eligible, feasible alternates that fit the remaining time', () => {
    const p: Plan = buildPlan(DATA, base({ hours: 9 }));
    expect(p.stops.length).toBeGreaterThan(1);
    const alts = findAlternates(DATA, p, 1);
    expect(alts.length).toBeLessThanOrEqual(3);
    for (const a of alts) {
      expect(a.place.guardrail.visitorReady).toBe(true);
      expect(a.verdict).not.toBe('not');
      expect(p.stops.some((s) => s.unit.id === a.unit.id)).toBe(false);
      expect(a.arrive).toBeLessThan(p.endMin);
    }
  });
  it('the four verdicts all come from explicit rules', () => {
    const v = (id: string, date: string, arrival?: number) => checkUnit(DATA, unit(id).unit, date, { arrival }).verdict;
    expect(v('jai-vilas', '2026-10-21', 600)).toBe('good');
    expect(v('jai-vilas', '2026-10-21', 945)).toBe('precautions'); // within 30 min of latest arrival
    expect(v('fort-asi-museum', '2026-10-21')).toBe('confirm');
    expect(v('jai-vilas', '2026-10-21', 1020)).toBe('not'); // too late to finish before closing
  });
});

describe('AT-09 fee by payment mode and section (FR-KB-02, FR-BR-01)', () => {
  it('fort ASI fees by visitor type and cash/online; state sections have separate tickets', () => {
    const asi = unit('fort-asi').unit;
    const rows = asi.fees.v!.rows;
    expect(rows.find((r) => r.who === 'indian')).toMatchObject({ cash: 25, online: 20 });
    expect(rows.find((r) => r.who === 'foreign')).toMatchObject({ cash: 300, online: 250 });
    expect(rows.find((r) => r.who === 'child')).toMatchObject({ cash: 0, online: 0 });
    const fort = DATA.places.find((p) => p.id === 'gwalior-fort')!;
    expect(new Set(fort.units.map((u) => u.ticket)).size).toBe(fort.units.length);
    expect(unit('fort-gujari').unit.custodian.t!.en).toMatch(/MP Directorate/);
  });
  it('one ASI ticket is counted once in the budget', () => {
    const p = buildPlan(DATA, base({ profile: { ...DEFAULT_PROFILE, likes: ['temples', 'architecture'] }, startPoint: 'fort', returnToStart: false, hours: 5 }));
    const asi = p.stops.filter((s) => s.unit.ticket === 'asi-fort').length;
    expect(asi).toBeGreaterThan(1);
    expect(p.budget.fees.min).toBe(2 * 20 * 1 + (p.stops.some((s) => s.unit.ticket === 'state-gujari') ? 40 : 0) + (p.stops.some((s) => s.unit.ticket === 'jai-vilas') ? 700 : 0));
  });
});

describe('AT-13 works without the LLM and routing API (E6, E7)', () => {
  it('plan builds from the local core; every leg is marked estimated', () => {
    const p = buildPlan(DATA, base());
    expect(p.stops.length).toBeGreaterThan(0);
    expect(p.stops.every((s) => s.leg.estimated)).toBe(true);
  });
});

describe('AT-16 chat starts a plan (VO-03, VO-07, AI-10, E19)', () => {
  it('asks which date when the weekday and date disagree', () => {
    const r = parseTrip('free next Sunday 20 November, 6 hours from noon, starting at the railway station', TODAY);
    expect(r.mismatch).toEqual({ date: '2026-11-20', stated: 0, actual: 5, options: ['2026-11-20', '2026-11-22'] });
    expect(r.date).toBeUndefined();
    expect(r.hours).toBe(6);
    expect(r.start).toBe('12:00');
    expect(r.startPoint).toBe('station');
  });
  it('after the answer, the plan uses profile defaults and excludes dislikes', () => {
    const profile = { ...DEFAULT_PROFILE, likes: ['architecture'], dislikes: ['royal', 'museums'] };
    const p = buildPlan(DATA, base({ date: '2026-11-22', start: '12:00', hours: 6, profile }));
    expect(p.stops.length).toBeGreaterThan(0);
    expect(p.stops.some((s) => s.place.tags.some((t) => profile.dislikes.includes(t)))).toBe(false);
  });
  it('Hindi text parses the same way', () => {
    const r = parseTrip('20 नवंबर रविवार, दोपहर से 6 घंटे, स्टेशन से शुरू', TODAY);
    expect(r.mismatch?.options).toEqual(['2026-11-20', '2026-11-22']);
    expect(r.hours).toBe(6);
  });
});

describe('AT-17 uncovered city (FR-AI-11, E20)', () => {
  it('a city not in the knowledge base is "not covered yet"', () => {
    expect(parseTrip('plan 6 hours in Jaipur on 20 November', TODAY).uncoveredCity).toBe('jaipur');
    expect(isCovered('Agra')).toBe(false);
    expect(isCovered('gwalior')).toBe(true);
  });
});
