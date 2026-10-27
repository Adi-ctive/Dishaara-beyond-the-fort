import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, SEED, buildPlan, findAlternates, promotable, replan, runFreshness, searchByName, type PlanInput } from './index';

// Decision 28 (16 Oct 2026): visitor-added places and the three leak fixes. AT-20 to AT-24.

const TODAY = '2026-10-14';
const { data: DATA } = runFreshness(SEED, TODAY);
const W = 'tansen-tomb'; // not eligible (contested), but ASI hours are on record, so it can be time-checked

const base = (o: Partial<PlanInput> = {}): PlanInput => ({
  date: '2026-10-21', start: '09:00', hours: 8, startPoint: 'station', returnToStart: true,
  modes: ['walk', 'auto', 'cab'], group: { indian: 2, foreign: 0, child: 0 }, payment: 'online',
  profile: { ...DEFAULT_PROFILE }, ...o,
});

describe('AT-20 visitor-added place (FR-PL-12, FR-GR-03)', () => {
  const plan = buildPlan(DATA, base({ added: [W] }));
  const stop = plan.stops.find((s) => s.place.id === W);

  it('W is in the plan with its time fit and leg costs, labelled as added by the visitor', () => {
    expect(stop).toBeDefined();
    expect(stop!.added).toBe(true);
    expect(stop!.leg.km).toBeGreaterThan(0);
    expect(stop!.leg.fare ?? stop!.leg.mode === 'walk').toBeTruthy();
    expect(['good', 'precautions', 'confirm']).toContain(stop!.check.verdict);
    expect(plan.stops.filter((s) => !s.added).length).toBeGreaterThan(0); // the rest is still a normal plan
    expect(plan.stops.filter((s) => s.added).map((s) => s.place.id)).toEqual([W]);
  });

  it('W is never an alternate: 0 appearances when any other stop is marked unreachable, before or after a replan', () => {
    let seen = 0;
    plan.stops.forEach((s, i) => {
      if (s.place.id === W) return;
      const alts = findAlternates(DATA, plan, i);
      seen += alts.filter((a) => a.place.id === W).length;
      const re = replan(DATA, plan, i, alts[0] ?? null);
      re.stops.forEach((_, j) => { seen += findAlternates(DATA, re, j).filter((a) => a.place.id === W).length; });
    });
    expect(seen).toBe(0);
  });

  it('W stays out of every list and of plans where the visitor did not add it', () => {
    expect(DATA.places.filter((p) => promotable(p, '2026-10-21')).map((p) => p.id)).not.toContain(W); // Explore list, nearby panels
    let seen = 0;
    for (let i = 0; i < 10; i++) {
      const p = buildPlan(DATA, base({ startPoint: ['ghauspura', 'fort', 'station'][i % 3], hours: 3 + i, profile: { ...DEFAULT_PROFILE, likes: ['music'] } }));
      seen += p.stops.filter((s) => s.place.id === W).length + p.leftOut.filter((l) => l.place.id === W).length;
    }
    expect(seen).toBe(0);
  });

  it('an added place whose hours are unavailable is left out with that reason, never timed on a guess', () => {
    const p = buildPlan(DATA, base({ added: ['maharaj-bada'] }));
    expect(p.stops.some((s) => s.place.id === 'maharaj-bada')).toBe(false);
    expect(p.leftOut.find((l) => l.place.id === 'maharaj-bada')?.reason).toBe('hoursUnavailable');
  });

  it('a plan with no added places is unchanged by the feature', () => {
    expect(JSON.stringify(buildPlan(DATA, base({ added: [] })).stops.map((s) => s.unit.id))).toBe(JSON.stringify(buildPlan(DATA, base()).stops.map((s) => s.unit.id)));
  });
});

describe('AT-21 leak fix 1: search by name only (FR-VO-08)', () => {
  it('full names, other names and Hindi names are found', () => {
    expect(searchByName(DATA, 'Jai Vilas Palace')).toEqual(['jai-vilas']);
    expect(searchByName(DATA, 'Tomb of Tansen')).toEqual([W]);
    expect(searchByName(DATA, 'tansen')).toEqual([W]);
    expect(searchByName(DATA, 'Gwalior Fort')).toEqual(['gwalior-fort']);
    expect(searchByName(DATA, 'जय विलास')).toEqual(['jai-vilas']);
    expect(searchByName(DATA, 'Sas-Bahu')).toEqual(['sas-bahu']);
  });
  it('near matches (typos) are found', () => {
    expect(searchByName(DATA, 'jai vilas palce')).toEqual(['jai-vilas']);
    expect(searchByName(DATA, 'gurudwaara')).toEqual(['gurudwara-data-bandi-chhod']);
    expect(searchByName(DATA, 'suraj kundh')).toEqual(['suraj-kund']);
  });
  it('partial names return nothing (no autocomplete)', () => {
    for (const q of ['sas', 'jai', 'tel', 'tan', 'gwal', 'sun', 'gur', 'ja']) expect(searchByName(DATA, q)).toEqual([]);
  });
  it('interest words return no interest-based list', () => {
    for (const q of ['temples', 'temple', 'music', 'museums', 'royal', 'spiritual', 'architecture', 'history', 'lesser known', 'मंदिर', 'संगीत'])
      expect(searchByName(DATA, q)).toEqual([]);
  });
});

describe('AT-22 leak fix 2: no nearby panel on unflagged pages (FR-BR-07)', () => {
  it('only Level 2 pages get a nearby panel, and it lists only Level 2 places', () => {
    const flagged = DATA.places.filter((p) => promotable(p, '2026-10-21')).map((p) => p.id);
    expect(flagged).toEqual(['teli-ka-mandir']); // the one demo Level 2 flag
    for (const p of DATA.places) if (p.id !== 'teli-ka-mandir') expect(promotable(p, '2026-10-21')).toBe(false);
  });
});

describe('AT-24 excluded categories added by a visitor show the rules first (FR-BR-08)', () => {
  const get = (id: string) => DATA.places.find((p) => p.id === id)!;
  it('places of worship and contested sites carry the rules record', () => {
    expect(get('gurudwara-data-bandi-chhod').sensitive?.kind).toBe('worship');
    expect(get('sun-temple').sensitive?.kind).toBe('worship');
    expect(get('tansen-tomb').sensitive?.kind).toBe('contested');
    expect(get('ghaus-tomb').sensitive?.kind).toBe('contested');
  });
  it('rules not yet sourced are "unavailable" with a reason, never guessed', () => {
    for (const id of ['gurudwara-data-bandi-chhod', 'sun-temple', 'tansen-tomb', 'ghaus-tomb']) {
      const s = get(id).sensitive!;
      for (const f of [s.dress, s.worship].filter(Boolean)) {
        expect(f!.v).toBeNull();
        expect(f!.s).toBeUndefined();
        expect(f!.why?.en).toBeTruthy();
      }
    }
    expect(get('sun-temple').sensitive!.worship).toBeDefined();
  });
  it('a visitor can still add them: the guardrail does not block an added place', () => {
    const p = buildPlan(DATA, base({ added: ['ghaus-tomb', W], startPoint: 'ghauspura' }));
    expect(p.stops.some((s) => s.place.id === W) || p.leftOut.some((l) => l.place.id === W)).toBe(true);
    expect(p.stops.some((s) => s.place.id === 'ghaus-tomb') || p.leftOut.some((l) => l.place.id === 'ghaus-tomb')).toBe(true);
  });
});
