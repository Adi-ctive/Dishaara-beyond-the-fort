// Grounding check (FR-AI-04): every time, date, fee, distance, duration and phone number in an
// AI answer must match a value in the tool results (or the visitor's own words). Mirrors backend/app/grounding.py.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const HI_MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const pad = (n: number | string) => String(n).padStart(2, '0');
const normTime = (t: string) => { const [h, m] = t.split(':'); return `${pad(+h)}:${m}`; };

export interface Grounding { ok: boolean; missing: string[] }

export function groundingCheck(answer: string, sources: unknown[]): Grounding {
  const corpus = JSON.stringify(sources).toLowerCase();
  const times = new Set([...corpus.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map((m) => normTime(m[0])));
  const nums = new Set([...corpus.replace(/(\d),(\d)/g, '$1$2').matchAll(/\d+(?:\.\d+)?/g)].map((m) => String(+m[0])));
  const isoDays = new Set([...corpus.matchAll(/\d{4}-(\d{2})-(\d{2})/g)].map((m) => `${m[1]}-${m[2]}`));
  const text = answer.toLowerCase();
  const missing: string[] = [];

  for (const m of text.matchAll(/\b\d{1,2}:\d{2}\b/g)) if (!times.has(normTime(m[0]))) missing.push(m[0]);
  // Dates written as "22 Nov" or "22 नवंबर"
  for (const m of text.matchAll(/\b(\d{1,2})\s+([a-zऀ-ॿ]+)/g)) {
    const mi = MONTHS.findIndex((x) => m[2].startsWith(x));
    const hi = HI_MONTHS.findIndex((x) => m[2].startsWith(x.slice(0, 3)));
    const idx = mi >= 0 ? mi : hi;
    if (idx >= 0 && !isoDays.has(`${pad(idx + 1)}-${pad(m[1])}`)) missing.push(m[0]);
  }
  const numeric = [
    /₹\s?\d[\d,]*(?:\s?[–-]\s?\d[\d,]*)?/g, // fees and budgets
    /\b\d+(?:\.\d+)?\s?(?:km|kms|min|mins|minutes|hours|hour|hrs|h\b|किमी|मिनट|घंटे|घंटा)/g, // distances, durations
    /\+?\d[\d -]{8,}\d/g, // phone numbers
  ];
  for (const re of numeric) for (const m of text.matchAll(re)) {
    const values = m[0].replace(/(\d),(\d)/g, '$1$2').match(/\d+(?:\.\d+)?/g) ?? [];
    const phone = m[0].replace(/\D/g, '');
    if (re === numeric[2]) { if (!corpus.replace(/\D/g, '').includes(phone)) missing.push(m[0].trim()); continue; }
    if (values.some((v) => !nums.has(String(+v)))) missing.push(m[0].trim());
  }
  return { ok: missing.length === 0, missing };
}
