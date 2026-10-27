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
  // Indore
  rajwada: ['rajwada', 'rajwada palace', 'holkar palace', 'राजवाड़ा', 'राजवाडा'],
  'lal-bagh': ['lal bagh', 'lalbagh', 'lal bagh palace', 'लाल बाग', 'लालबाग'],
  'central-museum': ['central museum', 'indore museum', 'केंद्रीय संग्रहालय', 'इंदौर संग्रहालय'],
  sarafa: ['sarafa', 'sarafa bazaar', 'sarafa bazar', 'सराफ़ा', 'सराफा'],
  'kanch-mandir': ['kanch mandir', 'glass temple', 'कांच मंदिर', 'काँच मंदिर'],
  khajrana: ['khajrana', 'khajrana ganesh', 'खजराना', 'खजराना गणेश'],
  'bada-ganpati': ['bada ganpati', 'bada ganesh', 'बड़ा गणपति', 'बडा गणपति'],
  'krishnapura-chhatri': ['krishnapura', 'krishnapura chhatri', 'krishnapura chhatris', 'chhatri', 'chhatris', 'chhatri bagh', 'कृष्णपुरा', 'छत्री', 'छत्रियाँ'],
  '56-dukan': ['56 dukan', '56 dukaan', 'chappan dukan', 'chhappan dukan', 'chhappan', '56 shops', '56 दुकान', 'छप्पन दुकान', 'छप्पन'],
  'light-sound-show': ['light and sound', 'light & sound', 'sound and light', 'laser show', 'लाइट एंड साउंड', 'लाइट शो'],
  'tighra-dam': ['tighra', 'tigra', 'tighra dam', 'तिघरा', 'तिगरा'],
  'db-city-mall': ['db city', 'db mall', 'dbcity', 'डीबी सिटी', 'डीबी मॉल'],
  'phool-bagh': ['phool bagh', 'phoolbagh', 'फूल बाग'],
  'phoenix-citadel': ['phoenix', 'phoenix citadel', 'phoenix mall', 'फ़ीनिक्स', 'फीनिक्स'],
  'treasure-island': ['treasure island', 'ti mall', 'ट्रेज़र आइलैंड'],
  'meghdoot-garden': ['meghdoot', 'meghdoot garden', 'मेघदूत'],
  mrignayani: ['mrignayani', 'मृगनयनी'],
  'gulawat-lotus-valley': ['gulawat', 'lotus valley', 'गुलावट', 'लोटस वैली'],
  ralamandal: ['ralamandal', 'रालामंडल'],
  patalpani: ['patalpani', 'पातालपानी'],
  'choral-dam': ['choral', 'choral dam', 'चोरल'],
  annapurna: ['annapurna', 'annapurna mandir', 'annapurna temple', 'अन्नपूर्णा', 'अन्नपूर्णा मंदिर'],
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
 * Places the text names, best match first: an exact name beats a near spelling, and a longer
 * name beats a shorter one. "teli ka mandir" is Teli ka Mandir, not "man mandir" (the fort) by typo.
 */
export function rankedPlaces(data: Data, text: string): string[] {
  const t = norm(text);
  if (!t.trim()) return [];
  const scored: [string, number][] = [];
  for (const [id, names] of namesOf(data)) {
    let best = -1;
    for (const n of names) {
      if (t.includes(` ${n} `)) best = Math.max(best, 1000 + n.length);
      else if (hasName(t, n)) best = Math.max(best, n.length);
    }
    if (best >= 0) scored.push([id, best]);
  }
  return scored.sort((a, b) => b[1] - a[1]).map(([id]) => id);
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
