import seed from '../data/gwalior.json';
import indore from '../data/indore.json';
import type { Data, Guardrail } from './types';

export * from './types';
export * from './facts';
export * from './time';
export * from './geo';
export * from './feasibility';
export * from './explain';
export * from './guardrail';
export * from './planner';
export * from './alternates';
export * from './parse';
export * from './grounding';
export * from './names';
export * from './events';

export const SEED = seed as unknown as Data;

/** Cities with checked data. The app switches city by the raahi's live location or by hand. */
export type CityId = 'gwalior' | 'indore';
export const SEEDS: Record<CityId, Data> = { gwalior: SEED, indore: indore as unknown as Data };
export const CITY_IDS = Object.keys(SEEDS) as CityId[];

/** The covered city within 60 km of a point, nearest first. null when far from all. */
export function cityNear(lat: number, lng: number): CityId | null {
  let best: [CityId, number] | null = null;
  for (const id of CITY_IDS) {
    const [clat, clng] = SEEDS[id].city.center;
    const r = Math.PI / 180;
    const d = 6371 * 2 * Math.asin(Math.sqrt(Math.sin(((clat - lat) * r) / 2) ** 2 + Math.cos(lat * r) * Math.cos(clat * r) * Math.sin(((clng - lng) * r) / 2) ** 2));
    if (d <= 60 && (!best || d < best[1])) best = [id, d];
  }
  return best ? best[0] : null;
}

/** Apply custodian guardrail changes (FR-GR-05, mocked via the partner portal) to a copy of the data. */
export function withGuardrails(data: Data, overrides: Record<string, Partial<Guardrail>>): Data {
  const copy: Data = JSON.parse(JSON.stringify(data));
  for (const p of copy.places) if (overrides[p.id]) p.guardrail = { ...p.guardrail, ...overrides[p.id] };
  return copy;
}
