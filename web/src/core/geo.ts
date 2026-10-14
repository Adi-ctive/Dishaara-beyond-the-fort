import type { Budget, Data, FareBand, Mode, Walking } from './types';

// Without a routing API key, leg times are straight-line distance × road factor at a set speed,
// always labelled "estimated" (SRS E6, AT-13).
export const ROAD_FACTOR = 1.5;
export const SPEED_KMH: Record<Mode, number> = { walk: 4.5, auto: 18, cab: 22 };
export const WALK_LIMIT_KM: Record<Walking, number> = { low: 0.5, medium: 1.5, high: 3 };
export const SEATS: Record<Mode, number> = { walk: 99, auto: 3, cab: 4 };

export function haversineKm(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r;
  const dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export interface Leg {
  mode: Mode;
  km: number;
  minutes: number;
  buffer: number;
  fare: { min: number; max: number } | null; // null = fare unknown (E11)
  fareBand?: FareBand;
  vehicles: number;
  flags: ('walkOverLimit' | 'autoNotAllowed')[];
  estimated: true;
}

/** FR-PL-03: leg buffer = max(15 min, 20% of leg time). */
export const legBuffer = (minutes: number) => Math.max(15, Math.round(minutes * 0.2));

export function makeLeg(
  data: Data,
  from: [number, number],
  to: [number, number],
  opts: { modes: Mode[]; walking: Walking; budget: Budget; insideFort: boolean; people: number },
): Leg {
  const km = Math.round(haversineKm(from, to) * ROAD_FACTOR * 10) / 10;
  const flags: Leg['flags'] = [];
  let mode: Mode | undefined;
  if (opts.modes.includes('walk') && km <= WALK_LIMIT_KM[opts.walking]) mode = 'walk';
  if (!mode) {
    const order: Mode[] = opts.budget === 'low' ? ['auto', 'cab'] : ['cab', 'auto'];
    mode = order.find((m) => opts.modes.includes(m) && !(m === 'auto' && opts.insideFort));
    if (!mode && opts.insideFort && opts.modes.includes('auto')) flags.push('autoNotAllowed');
  }
  if (!mode) {
    mode = 'walk';
    if (km > WALK_LIMIT_KM[opts.walking]) flags.push('walkOverLimit');
  }
  const minutes = Math.max(2, Math.round((km / SPEED_KMH[mode]) * 60));
  const vehicles = mode === 'walk' ? 0 : Math.ceil(Math.max(1, opts.people) / SEATS[mode]);
  let fare: Leg['fare'] = mode === 'walk' ? { min: 0, max: 0 } : null;
  const band = data.fares.find((f) => f.mode === mode && km <= f.maxKm);
  if (band) fare = { min: band.min * vehicles, max: band.max * vehicles };
  return { mode, km, minutes, buffer: legBuffer(minutes), fare, fareBand: band, vehicles, flags, estimated: true };
}
