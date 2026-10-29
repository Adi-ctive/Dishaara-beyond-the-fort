import { describe, expect, it } from 'vitest';
import {
  SEED, allUnits, buildPlan, checkUnit, findAlternates, latestArrival, parseTrip, runFreshness, isCovered,
  visitMinutes, windowFor, withGuardrails, guardrail, promotable, score, LESSER_KNOWN_BOOST, type Mode, type PlanInput, type Plan, DEFAULT_PROFILE,
} from './index';

const TODAY = '2026-10-14'; // Wednesday
const { data: DATA } = runFreshness(SEED, TODAY);
const unit = (id: string) => allUnits(DATA).find((u) => u.unit.id === id)!;

// Jai Vilas is "conflicting" in the seed since 22 Oct (Priyangi's Fact 2). The rule tests below
// need a confirmed record, so they run on a copy where its stamps read "officially confirmed".
function confirmedJV() {
  const d = JSON.parse(JSON.stringify(SEED));
  const jv = d.places.find((p: { id: string }) => p.id === 'jai-vilas').units[0];
  for (const k of ['hours', 'weeklyClosed', 'fees']) jv[k].s = 'officially confirmed';
  return d;
}
const JV_DATA = runFreshness(confirmedJV(), TODAY).data;

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
    const d = confirmedJV();
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
    expect(allUnits(JV_DATA).find((u) => u.unit.id === 'jai-vilas')!.unit.hours.s).toBe('officially confirmed');
    expect(unit('fort-gujari').unit.hours.s).toBe('potentially outdated'); // MP Tourism page of 31 Oct 2023
  });
});

describe('AT-06 guardrail: not-eligible places never planned, Level 2 only promoted (FR-GR-02/03, Decision 25)', () => {
  const NOT = ['tansen-tomb', 'ghaus-tomb', 'gurudwara-data-bandi-chhod', 'sun-temple', 'suraj-kund'];
  const runs = (d: typeof DATA, ids: string[]) => {
    let seen = 0;
    for (let i = 0; i < 30; i++) {
      const p = buildPlan(d, base({ profile: { ...DEFAULT_PROFILE, likes: [['music'], ['spiritual'], ['temples', 'architecture']][i % 3] }, startPoint: ['ghauspura', 'fort', 'station'][i % 3], start: ['08:00', '10:00', '13:00'][i % 3], hours: 2 + (i % 10) }));
      seen += p.stops.filter((s) => ids.includes(s.place.id)).length;
      if (p.stops.length) seen += findAlternates(d, p, i % p.stops.length).filter((a) => ids.includes(a.place.id)).length;
    }
    return seen;
  };
  it('notEligible places appear 0 times in 30 plans and 30 alternate requests, and stay describable', () => {
    expect(runs(DATA, NOT)).toBe(0);
    for (const id of NOT) {
      expect(DATA.places.some((p) => p.id === id)).toBe(true); // still viewable by search
      expect(guardrail(DATA.places.find((p) => p.id === id)!, '2026-10-21').reason).toBe('notEligible');
    }
  });
  it('the check is not vacuous: the same place at Level 1 does get planned', () => {
    const pub = DATA.places.find((p) => p.id === 'jai-vilas')!.guardrail.publication;
    const d = withGuardrails(DATA, { 'tansen-tomb': { status: 'level1', publication: pub } });
    expect(runs(d, ['tansen-tomb'])).toBeGreaterThan(0);
  });
  it('the lesser-known boost applies to Level 2 only', () => {
    const teli = DATA.places.find((p) => p.id === 'teli-ka-mandir')!;
    const asLevel1 = { ...teli, guardrail: { ...teli.guardrail, status: 'level1' as const } };
    expect(score(teli, ['temples']) - score(asLevel1, ['temples'])).toBe(LESSER_KNOWN_BOOST);
    expect(promotable(teli, '2026-10-21')).toBe(true);
    expect(promotable(asLevel1, '2026-10-21')).toBe(false);
  });
});

describe('AT-07 guardrail: daily limit, Level 2 only (FR-GR-04)', () => {
  it('Teli ka Mandir (demo Level 2, limit 2) is excluded from the third plan that date', () => {
    const inp = base({ profile: { ...DEFAULT_PROFILE, likes: ['temples'] }, startPoint: 'fort' });
    expect(buildPlan(DATA, inp).stops.some((s) => s.place.id === 'teli-ka-mandir')).toBe(true);
    const third = buildPlan(DATA, { ...inp, counts: { [inp.date]: { 'teli-ka-mandir': 2 } } });
    expect(third.stops.some((s) => s.place.id === 'teli-ka-mandir')).toBe(false);
  });
  it('a Level 1 place has no daily limit', () => {
    const inp = base({ profile: { ...DEFAULT_PROFILE, likes: ['royal'] }, startPoint: 'jaivilas', start: '10:00' });
    const p = buildPlan(DATA, { ...inp, counts: { [inp.date]: { 'jai-vilas': 999 } } });
    expect(p.stops.some((s) => s.place.id === 'jai-vilas')).toBe(true);
  });
});

describe('AT-19 Level 1 ends on stale, conflicting or withdrawn status (FR-GR-02, Decision 25)', () => {
  const count = (d: typeof DATA) => {
    let seen = 0;
    for (let i = 0; i < 10; i++) {
      const p = buildPlan(d, base({ profile: { ...DEFAULT_PROFILE, likes: ['royal', 'museums'] }, startPoint: ['jaivilas', 'station', 'fort'][i % 3], start: ['10:00', '11:00', '12:00'][i % 3], hours: 4 + (i % 5) }));
      seen += p.stops.filter((s) => s.place.id === 'jai-vilas').length;
      if (p.stops.length) seen += findAlternates(d, p, i % p.stops.length).filter((a) => a.place.id === 'jai-vilas').length;
    }
    return seen;
  };
  const mutate = (f: (jv: Record<string, any>) => void) => {
    const d = JSON.parse(JSON.stringify(SEED));
    f(d.places.find((p: { id: string }) => p.id === 'jai-vilas').guardrail);
    return runFreshness(d, TODAY).data;
  };
  it('baseline: Jai Vilas at Level 1 is planned', () => {
    expect(guardrail(DATA.places.find((p) => p.id === 'jai-vilas')!, '2026-10-21')).toEqual({ ok: true, level: 1 });
    expect(count(DATA)).toBeGreaterThan(0);
  });
  it('stale publication (past check-by after the daily job): 0 in 10 plans and 10 alternate requests', () => {
    const d = mutate((g) => { g.publication.ver = '2026-01-01'; });
    expect(guardrail(d.places.find((p) => p.id === 'jai-vilas')!, '2026-10-21').reason).toBe('publicationStale');
    expect(count(d)).toBe(0);
  });
  it('conflicting publication: 0 in 10 plans and 10 alternate requests', () => {
    const d = mutate((g) => { g.publication.s = 'conflicting'; });
    expect(guardrail(d.places.find((p) => p.id === 'jai-vilas')!, '2026-10-21').reason).toBe('publicationConflict');
    expect(count(d)).toBe(0);
  });
  it('withdrawn by the custodian: 0 in 10 plans and 10 alternate requests', () => {
    const d = mutate((g) => { g.status = 'withdrawn'; });
    expect(guardrail(d.places.find((p) => p.id === 'jai-vilas')!, '2026-10-21').reason).toBe('withdrawn');
    expect(count(d)).toBe(0);
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
      expect(guardrail(a.place, p.input.date).ok).toBe(true);
      expect(a.verdict).not.toBe('not');
      expect(p.stops.some((s) => s.unit.id === a.unit.id)).toBe(false);
      expect(a.arrive).toBeLessThan(p.endMin);
    }
  });
  it('the four verdicts all come from explicit rules', () => {
    const v = (id: string, date: string, arrival?: number) =>
      checkUnit(JV_DATA, allUnits(JV_DATA).find((u) => u.unit.id === id)!.unit, date, { arrival }).verdict;
    expect(v('jai-vilas', '2026-10-21', 600)).toBe('good');
    expect(v('jai-vilas', '2026-10-21', 945)).toBe('precautions'); // within 30 min of latest arrival
    expect(v('fort-asi-museum', '2026-10-21')).toBe('confirm');
    expect(v('jai-vilas', '2026-10-21', 1020)).toBe('not'); // too late to finish before closing
  });
  it('Jai Vilas in the seed is conflicting and always asks the visitor to confirm (Priyangi, Fact 2)', () => {
    const jv = unit('jai-vilas').unit;
    expect(jv.hours.s).toBe('conflicting');
    expect(jv.fees.why?.en).toMatch(/verify these details with the venue/);
    expect(checkUnit(DATA, jv, '2026-10-21', { arrival: 600 }).verdict).toBe('confirm');
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
    expect(p.budget.fees.min).toBe(2 * 20 * 1 + (p.stops.some((s) => s.unit.ticket === 'state-gujari') ? 40 : 0) + (p.stops.some((s) => s.unit.ticket === 'jai-vilas') ? 700 : 0) + (p.stops.some((s) => s.unit.ticket === 'asi-museum') ? 2 * 5 : 0));
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

describe('the raahi limit on time at one place', () => {
  it('caps visit time but never below the minimum visit', () => {
    const relaxed = base({ profile: { ...DEFAULT_PROFILE, pace: 'relaxed', likes: ['architecture'] }, hours: 8 });
    const free = buildPlan(DATA, relaxed);
    const capped = buildPlan(DATA, { ...relaxed, maxVisit: 30 });
    for (const st of capped.stops) {
      expect(st.visit).toBeGreaterThanOrEqual(st.unit.minVisit.v ?? 30);
      expect(st.visit).toBeLessThanOrEqual(Math.max(30, st.unit.minVisit.v ?? 30));
    }
    expect(capped.stops.reduce((n, x) => n + x.visit, 0) / capped.stops.length).toBeLessThanOrEqual(free.stops.reduce((n, x) => n + x.visit, 0) / free.stops.length);
  });
});

describe('events for planning ahead', () => {
  it('finds exact dates, and guesses a yearly event from its last dates when this year is not known', async () => {
    const { eventsOn, eventsInMonth, SEEDS } = await import('./index');
    const g = SEEDS.gwalior;
    // Tansen 2026 has official dates; the trade fair's 2026-27 dates are not out, so last season's window is the guess.
    expect(eventsOn(g, '2026-12-16').map((e) => e.id)).toEqual(['tansen-samaroh-2026']);
    const fair = eventsOn(g, '2027-01-20');
    expect(fair.map((e) => [e.id, e.s, e.guess?.from])).toEqual([['trade-fair', 'historical pattern', '2024-12-25']]);
    expect(eventsOn(g, '2026-11-10')).toEqual([]);
    // Lunar events: the month is known, the day moves, so the guess allows about three weeks either side.
    expect(eventsInMonth(SEEDS.indore, '2027-03').map((e) => e.id)).toEqual(['rangpanchami-2027']);
    expect(eventsOn(SEEDS.indore, '2027-09-20').map((e) => [e.id, e.s])).toEqual([['gulawat-bloom', 'unverified'], ['anant-chaturdashi', 'historical pattern']]);
    // Next year's Tansen: guessed from 2026's dates.
    expect(eventsOn(g, '2027-12-15').map((e) => [e.id, e.guess?.from])).toEqual([['tansen-samaroh-2026', '2026-12-14']]);
  });
});

describe('a question about the other city', () => {
  it('names an Indore place only in Indore data', async () => {
    const { SEEDS, rankedPlaces } = await import('./index');
    expect(rankedPlaces(SEEDS.indore, 'What else is near Rajwada?').length).toBeGreaterThan(0);
    expect(rankedPlaces(SEEDS.gwalior, 'What else is near Rajwada?')).toEqual([]);
    for (const q of ['What is open today?', 'Hidden places', 'Food nearby', 'Plan my day', 'ticket price']) expect(rankedPlaces(SEEDS.indore, q)).toEqual([]);
  });
});

describe('cards follow the kind of question', () => {
  it('no cards for questions about the app, plan card only for plan requests', async () => {
    const { respond, cardsFor } = await import('../chat/local');
    const { SEED } = await import('./index');
    for (const q of ['What can you do?', 'Can you book tickets for me?', 'hello', 'How does the app check its facts?', 'आप क्या कर सकते हैं?']) {
      const r = respond(q, SEED, TODAY, q.match(/[ऀ-ॿ]/) ? 'hi' : 'en');
      expect(r.cards, q).toEqual([]);
      expect(cardsFor(q, [{ kind: 'places', ids: ['gwalior-fort'] }, { kind: 'quick' }], false), q).toEqual([]);
    }
    expect(cardsFor('Plan my day', [{ kind: 'quick' }], false)).toEqual([{ kind: 'quick' }]);
    expect(cardsFor('What is the Gwalior Fort ticket price?', [{ kind: 'quick' }, { kind: 'places', ids: ['gwalior-fort'] }], true)).toEqual([{ kind: 'places', ids: ['gwalior-fort'] }]);
    expect(cardsFor('I am hurt, call an ambulance', [{ kind: 'sos' }, { kind: 'quick' }], false)).toEqual([{ kind: 'sos' }]);
  });
});

describe('emergency words', () => {
  it('catches real emergencies, not "help me plan"', async () => {
    const { respond } = await import('../chat/local');
    const { SEED } = await import('./index');
    for (const q of ['Help, I lost my child near the fort', 'Someone stole my bag', 'मदद चाहिए, एम्बुलेंस बुलाओ', 'bachao']) expect(respond(q, SEED, TODAY, 'en').cards, q).toEqual([{ kind: 'sos' }]);
    for (const q of ['Can you help me plan my day?', 'help']) expect(respond(q, SEED, TODAY, 'en').cards, q).not.toContainEqual({ kind: 'sos' });
  });
});
