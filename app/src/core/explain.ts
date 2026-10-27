// Plain words for a verdict: what exactly is not certain, and how a raahi can check it.
// "Confirm first" on its own told people nothing (Aditya, 28 Oct): every confirm now names the fact
// and the way to confirm it.
import { isUnavailable } from './facts';
import type { CheckResult, Reason } from './feasibility';
import type { Data, Place, Unit } from './types';

type L = { en: string; hi: string };

const FIELD: Record<string, L> = {
  hours: { en: 'Opening hours', hi: 'खुलने का समय' },
  weeklyClosed: { en: 'Weekly closed day', hi: 'साप्ताहिक बंदी' },
  lastEntry: { en: 'Last entry time', hi: 'आख़िरी प्रवेश का समय' },
};
const WHY: Record<string, L> = {
  conflicting: { en: 'sources disagree', hi: 'स्रोत अलग-अलग बताते हैं' },
  unverified: { en: 'only one unofficial source', hi: 'सिर्फ़ एक अनौपचारिक स्रोत' },
  'potentially outdated': { en: 'the source may be old', hi: 'स्रोत पुराना हो सकता है' },
  'recently reported': { en: 'from a news or travel report, not the custodian', hi: 'ख़बर या यात्रा रिपोर्ट से, संरक्षक से नहीं' },
  estimated: { en: 'our estimate', hi: 'हमारा अनुमान' },
  'historical pattern': { en: 'a past pattern', hi: 'पुराना पैटर्न' },
};

/** One line per fact the raahi should check before going, e.g. "Opening hours: sources disagree". */
export function confirmItems(r: CheckResult, lang: 'en' | 'hi'): string[] {
  const out: string[] = [];
  for (const x of [...r.reasons, ...r.notes] as Reason[]) {
    const field = String(x.p?.field ?? (x.code === 'closureConflict' ? 'weeklyClosed' : ''));
    if (!FIELD[field]) continue;
    const why = x.code === 'unavailable' ? (lang === 'hi' ? 'प्रकाशित नहीं' : 'not published anywhere') : WHY[String(x.p?.status ?? 'conflicting')]?.[lang] ?? String(x.p?.status ?? '');
    const line = `${FIELD[field][lang]}: ${why}`;
    if (!out.includes(line)) out.push(line);
  }
  return out;
}

/** How to confirm: the place's own number when we have one, else the ticket counter or gate. */
export function howToConfirm(data: Data, p: Place, u: Unit, lang: 'en' | 'hi'): { text: string; phone?: string } {
  const c = p.contact;
  const phone = c && !isUnavailable(c) ? (c.t?.en ?? '').match(/(\+?\d[\d -]{7,}\d)/)?.[1]?.replace(/[ -]/g, '') : undefined;
  const who = u.custodian && !isUnavailable(u.custodian) ? u.custodian.t?.[lang] : undefined;
  if (phone) return { text: lang === 'hi' ? `जगह पर फ़ोन करें: ${phone}` : `Call the place: ${phone}`, phone };
  return {
    text: lang === 'hi'
      ? `पहुँचकर टिकट काउंटर या गेट पर पूछें${who ? ` (${who})` : ''}। हमारे पास इसका फ़ोन नंबर नहीं है।`
      : `Ask at the ticket counter or gate when you arrive${who ? ` (${who})` : ''}. We have no phone number for it.`,
  };
}
