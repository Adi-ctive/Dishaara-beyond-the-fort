import type { Data } from './types';

// Name-only place search (Decision 28, FR-VO-08, leak fix 1).
// A place is found only by an exact or near match on one of its names. No prefixes, no autocomplete,
// no interest words: "sas" or "temples" find nothing, "jai vilas palce" finds Jai Vilas Palace.

/** Extra names people use, on top of each place's own English and Hindi name. */
const NAMES: Record<string, string[]> = {
  'gwalior-fort': ['gwalior fort', 'fort', 'gwalior ka kila', 'kila', 'qila', 'gujari mahal', 'man mandir', 'man singh palace', 'hathi pol',
    'karan mahal', 'vikram mahal', 'jahangir mahal', 'shah jahan mahal', 'ग्वालियर किला', 'किला', 'किले', 'गूजरी महल', 'मान मंदिर', 'मान सिंह महल', 'हाथी पोल'],
  'sas-bahu': ['sas bahu', 'saas bahu', 'sas bahu temple', 'sahastrabahu', 'सास बहू', 'सास बहू मंदिर'],
  'teli-ka-mandir': ['teli ka mandir', 'teli', 'तेली का मंदिर', 'तेली'],
  'gurudwara-data-bandi-chhod': ['gurudwara data bandi chhod', 'data bandi chhod', 'gurudwara', 'gurdwara', 'गुरुद्वारा', 'दाता बंदी छोड़'],
  'jai-vilas': ['jai vilas', 'jai vilas palace', 'jaivilas', 'scindia museum', 'जय विलास', 'जय विलास महल'],
  'tansen-tomb': ['tansen', 'tansen tomb', 'tomb of tansen', 'तानसेन', 'तानसेन का मकबरा'],
  'ghaus-tomb': ['mohammad ghaus', 'muhammad ghaus', 'ghaus', 'tomb of mohammad ghaus', 'गौस', 'मोहम्मद गौस'],
  'suraj-kund': ['suraj kund', 'सूरज कुंड'],
  'sun-temple': ['sun temple', 'surya mandir', 'sun temple morar', 'सूर्य मंदिर'],
};

/** Lowercase, punctuation to spaces, single spaces. Keeps Devanagari. */
export const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim()} `;

function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

// Typos allowed: none under 5 letters, 1 up to 8, 2 from 9.
const tolerance = (n: number) => (n < 5 ? 0 : n < 9 ? 1 : 2);

function namesOf(data: Data): [string, string[]][] {
  return data.places.map((p) => [p.id, [...new Set([p.name.en, p.name.hi, ...(NAMES[p.id] ?? [])].map((n) => norm(n).trim()))]]);
}

/** True when the text contains the name as whole words, or a run of words within typo tolerance of it. */
function hasName(text: string, name: string): boolean {
  if (text.includes(` ${name} `)) return true;
  const tol = tolerance(name.length);
  if (!tol) return false;
  const words = text.trim().split(' ');
  const n = name.split(' ').length;
  for (let i = 0; i + n <= words.length; i++) if (lev(words.slice(i, i + n).join(' '), name) <= tol) return true;
  return false;
}

/** Places the text names, in seed order. Used for search and to tell what the visitor has named in chat. */
export function namedPlaces(data: Data, text: string): string[] {
  const t = norm(text);
  if (!t.trim()) return [];
  return namesOf(data).filter(([, names]) => names.some((n) => hasName(t, n))).map(([id]) => id);
}

/**
 * FR-AI-12, leak fix 3: places a reply names that the assistant may not volunteer.
 * Allowed: places the visitor named, stops of a plan the tools built, the visitor's added places,
 * start-point landmarks, and custodian-flagged (Level 2) places.
 */
export function mentionCheck(data: Data, reply: string, allowed: Iterable<string>): { ok: boolean; extra: string[] } {
  const ok = new Set(allowed);
  const extra = namedPlaces(data, reply).filter((id) => !ok.has(id));
  return { ok: !extra.length, extra };
}

/** FR-VO-08: search box. Any recorded place, whatever its guardrail level, but only by name. */
export const searchByName = namedPlaces;
