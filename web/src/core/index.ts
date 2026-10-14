import seed from '../data/gwalior.json';
import type { Data, Guardrail } from './types';

export * from './types';
export * from './facts';
export * from './time';
export * from './geo';
export * from './feasibility';
export * from './guardrail';
export * from './planner';
export * from './alternates';
export * from './parse';
export * from './grounding';

export const SEED = seed as unknown as Data;

/** Apply custodian guardrail changes (FR-GR-05, mocked via the partner portal) to a copy of the data. */
export function withGuardrails(data: Data, overrides: Record<string, Partial<Guardrail>>): Data {
  const copy: Data = JSON.parse(JSON.stringify(data));
  for (const p of copy.places) if (overrides[p.id]) p.guardrail = { ...p.guardrail, ...overrides[p.id] };
  return copy;
}
