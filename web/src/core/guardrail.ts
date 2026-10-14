import type { Counts, Place } from './types';

// Custodian guardrail (FR-GR-01..04). Unflagged places are describable on search but never promoted.
export function guardrail(p: Place, date: string, counts: Counts = {}): { ok: boolean; reason?: 'notReady' | 'noConsent' | 'atLimit' } {
  const g = p.guardrail;
  if (!g.visitorReady) return { ok: false, reason: 'notReady' };
  if (g.consentRequired && !g.consent) return { ok: false, reason: 'noConsent' };
  if (g.dailyLimit !== null && (counts[date]?.[p.id] ?? 0) >= g.dailyLimit) return { ok: false, reason: 'atLimit' };
  return { ok: true };
}
