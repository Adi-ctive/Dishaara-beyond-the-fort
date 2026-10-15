import { isUnavailable } from './facts';
import type { Counts, Place } from './types';

// Two-level custodian guardrail (Decision 25, FR-GR-01..05).
// Level 1: the custodian's own current publication shows the place open and ticketed. Plans and alternates only.
// Level 2: an explicit custodian flag. Adds the lesser-known boost, discovery lists and an optional daily limit.
// Level 1 ends when its publication fact is potentially outdated or conflicting, or on withdrawal.
// Places that are not eligible stay describable on search but are never planned or promoted.

export type GuardReason = 'notEligible' | 'withdrawn' | 'noPublication' | 'publicationStale' | 'publicationConflict' | 'atLimit';

export function guardrail(p: Place, date: string, counts: Counts = {}): { ok: boolean; level?: 1 | 2; reason?: GuardReason } {
  const g = p.guardrail;
  if (g.status === 'notEligible') return { ok: false, reason: 'notEligible' };
  if (g.status === 'withdrawn') return { ok: false, reason: 'withdrawn' };
  if (g.status === 'level2') {
    if (g.dailyLimit !== null && g.dailyLimit !== undefined && (counts[date]?.[p.id] ?? 0) >= g.dailyLimit) return { ok: false, level: 2, reason: 'atLimit' };
    return { ok: true, level: 2 };
  }
  const pub = g.publication;
  if (!pub || isUnavailable(pub) || !pub.s) return { ok: false, reason: 'noPublication' };
  if (pub.s === 'potentially outdated') return { ok: false, reason: 'publicationStale' };
  if (pub.s === 'conflicting') return { ok: false, reason: 'publicationConflict' };
  return { ok: true, level: 1 }; // Level 1 has no daily limit
}

/** Boost and discovery lists need Level 2 (an explicit custodian flag). */
export const promotable = (p: Place, date: string, counts: Counts = {}) => guardrail(p, date, counts).level === 2 && guardrail(p, date, counts).ok;
