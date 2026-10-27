// How a stored fact is shown: its text, a trust chip (label, date, who checked it), or a plain "not known yet".
import { fmt, isUnavailable, type Data, type Fact, type Label, type Place, type Verdict } from '../core';
import type { Lang } from '../theme/ThemeProvider';

export const LABEL_TEXT: Record<Label, { en: string; hi: string; tone: 'good' | 'mid' | 'weak' }> = {
  'officially confirmed': { en: 'Official', hi: 'आधिकारिक', tone: 'good' },
  'locally verified': { en: 'Checked on site', hi: 'मौके पर जाँचा', tone: 'good' },
  'recently reported': { en: 'Recently reported', hi: 'हाल की रिपोर्ट', tone: 'mid' },
  estimated: { en: 'Estimate', hi: 'अनुमान', tone: 'mid' },
  'historical pattern': { en: 'Past pattern', hi: 'पुराना पैटर्न', tone: 'mid' },
  unverified: { en: 'Not verified', hi: 'असत्यापित', tone: 'weak' },
  conflicting: { en: 'Sources disagree', hi: 'स्रोत अलग-अलग', tone: 'weak' },
  'potentially outdated': { en: 'May be outdated', hi: 'पुराना हो सकता है', tone: 'weak' },
};

import { confirmItems, howToConfirm, type CheckResult, type Unit } from '../core';

/** Under a verdict: exactly what to check, and how. Shown only for "Confirm first". */
export function ConfirmWhat({ c, data, p, u, lang, compact = false }: { c: CheckResult; data: Data; p: Place; u: Unit; lang: 'en' | 'hi'; compact?: boolean }) {
  if (c.verdict !== 'confirm') return null;
  const items = confirmItems(c, lang);
  if (!items.length) return null;
  const how = howToConfirm(data, p, u, lang);
  if (compact) return <span className="confirm-what small">{lang === 'hi' ? 'जाँचें: ' : 'Check: '}{items.map((x) => x.split(':')[0]).join(', ')}</span>;
  return (
    <div className="confirm-what">
      <b>{lang === 'hi' ? 'क्या पक्का करना है' : 'What to confirm'}</b>
      <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul>
      <p className="small">{how.phone ? <a href={`tel:${how.phone}`}>{how.text}</a> : how.text}</p>
    </div>
  );
}

export const VERDICT_TEXT: Record<Verdict, { en: string; hi: string; tone: 'good' | 'mid' | 'weak' | 'bad' }> = {
  good: { en: 'Good to go', hi: 'जा सकते हैं', tone: 'good' },
  precautions: { en: 'Go, with care', hi: 'सावधानी से जाएँ', tone: 'mid' },
  confirm: { en: 'Confirm first', hi: 'पहले पुष्टि करें', tone: 'weak' },
  not: { en: 'Not today', hi: 'आज नहीं', tone: 'bad' },
};

export const tx = (f: Fact | undefined, lang: Lang) => (f?.t ? f.t[lang] : '');
export const why = (f: Fact | undefined, lang: Lang) => (f?.why ? f.why[lang] : lang === 'hi' ? 'अभी पता नहीं' : 'Not known yet');

export function dateText(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export const sourceName = (data: Data, f?: Fact) => (f?.src ? data.sources[f.src]?.name ?? f.src : '');

export function TrustChip({ f, lang, data }: { f?: Fact; lang: Lang; data: Data }) {
  if (!f || isUnavailable(f) || !f.s) return <span className="chip-trust weak">{lang === 'hi' ? 'अभी पता नहीं' : 'Not known yet'}</span>;
  const l = LABEL_TEXT[f.s];
  return (
    <span className={`chip-trust ${l.tone}`} title={sourceName(data, f)}>
      <b>{l[lang]}</b>
      {f.ver && <span> · {dateText(f.ver)}</span>}
    </span>
  );
}

export function FactLine({ title, f, lang, data }: { title: string; f?: Fact; lang: Lang; data: Data }) {
  const missing = !f || isUnavailable(f);
  return (
    <div className="fact">
      <div className="fact-head">
        <span className="fact-title">{title}</span>
        <TrustChip f={f} lang={lang} data={data} />
      </div>
      <p className={missing ? 'fact-text unknown' : 'fact-text'}>{missing ? why(f, lang) : tx(f, lang)}</p>
      {!missing && f?.s === 'conflicting' && f.why && <p className="fact-warn">{f.why[lang]}</p>}
      {!missing && f?.src && (
        <p className="fact-src">
          {lang === 'hi' ? 'स्रोत' : 'Source'}: {sourceName(data, f)} · {lang === 'hi' ? 'टीम आर्गस ने जाँचा' : 'checked by Team Argus'}
        </p>
      )}
    </div>
  );
}

export const placeName = (p: Place, lang: Lang) => p.name[lang];
export const time = (m: number) => fmt(m);
