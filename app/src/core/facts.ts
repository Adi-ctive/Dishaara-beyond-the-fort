import type { Cls, Data, Fact, Label } from './types';

// Check-by intervals by field class (SRS §4.3).
export const CHECK_DAYS: Record<Cls, number> = { status: 7, fare: 30, hours: 90, fees: 90, rules: 180, history: 365 };

/** Labels that cannot support "good to go" (FR-FC-01, FR-PL-07). */
export const WEAK: Label[] = ['potentially outdated', 'unverified', 'conflicting'];
export const STRONG: Label[] = ['officially confirmed', 'locally verified'];

export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const isUnavailable = (f?: Fact) => !f || ((f.v === null || f.v === undefined) && !f.s && !f.t);
export const checkBy = (f: Fact) => (f.ver ? addDays(f.ver, CHECK_DAYS[f.cls]) : undefined);

export interface QueueItem { kind: 'stale' | 'conflict'; placeId: string; path: string; fact: Fact }

const AGES: Label[] = ['officially confirmed', 'locally verified', 'recently reported', 'estimated', 'historical pattern'];

/**
 * Daily freshness job (FR-VF-05): every fact past its check_by becomes "potentially outdated"
 * and joins the re-verification queue. Returns a new copy; the seed is never mutated.
 */
export function runFreshness(data: Data, asOf: string): { data: Data; queue: QueueItem[] } {
  const copy: Data = JSON.parse(JSON.stringify(data));
  const queue: QueueItem[] = [];
  const walk = (node: unknown, placeId: string, path: string) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, placeId, `${path}[${i}]`));
    const o = node as Record<string, unknown>;
    if (typeof o.cls === 'string' && typeof o.s === 'string') {
      const f = o as unknown as Fact;
      const cb = checkBy(f);
      if (AGES.includes(f.s!) && cb && cb < asOf) {
        f.was = f.s;
        f.s = 'potentially outdated';
        queue.push({ kind: 'stale', placeId, path, fact: f });
      } else if (f.s === 'conflicting') queue.push({ kind: 'conflict', placeId, path, fact: f });
    }
    for (const [k, v] of Object.entries(o)) if (k !== 'alt') walk(v, (o.units && typeof o.id === 'string' ? o.id : placeId), `${path}.${k}`);
  };
  copy.places.forEach((p) => walk(p, p.id, p.id));
  copy.fares.forEach((f, i) => walk(f, 'fares', `fares[${i}]`));
  copy.stationFares.forEach((f, i) => walk(f, f.place, `stationFares[${i}]`));
  return { data: copy, queue };
}
