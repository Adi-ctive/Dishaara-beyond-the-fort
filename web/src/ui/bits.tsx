import { useState, type ReactNode } from 'react';
import { checkBy, isUnavailable, type Fact, type Label, type Mode, type Reason, type Verdict } from '../core';
import { useA } from '../store';
import { fmt } from '../core';

// Status chips are text first, with a glyph; colour is never the only signal.
const GLYPH: Record<Label, string> = {
  'officially confirmed': '✓', 'locally verified': '✓', 'recently reported': '◷', estimated: '≈',
  'historical pattern': '↺', unverified: '?', conflicting: '⚠', 'potentially outdated': '⌛',
};
const slug = (s: string) => s.replace(/\s+/g, '-');

export function Chip({ s }: { s?: Label }) {
  const a = useA();
  if (!s) return <span className="chip chip-unavailable">— {a.t('unavailable')}</span>;
  return <span className={`chip chip-${slug(s)}`}><span aria-hidden>{GLYPH[s]}</span> {a.label(s)}</span>;
}

export function VerdictBadge({ v, small }: { v: Verdict; small?: boolean }) {
  const a = useA();
  const g = { good: '●', precautions: '◐', confirm: '?', not: '✕' }[v];
  return <span className={`verdict verdict-${v}${small ? ' small' : ''}`}><span aria-hidden>{g}</span> {a.t(`v_${v}`)}</span>;
}

export function ModeIcon({ m }: { m: Mode }) {
  const p = {
    walk: 'M13 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9.5 8l-2 9h2l1.3-5.5L12.5 14v6h2v-7.3l-1.9-2 .5-2.4A6 6 0 0 0 17 11v-2a4 4 0 0 1-3.3-1.8L12.8 6c-.4-.6-1-1-1.8-1-.3 0-.5 0-.8.1L6 7v4h2V8.3Z',
    auto: 'M4 15V9a3 3 0 0 1 3-3h7l4 5h1a1 1 0 0 1 1 1v3h-2a2 2 0 1 1-4 0H9a2 2 0 1 1-4 0H4Zm3-7v3h4V8H7Zm6 0v3h3l-2.4-3H13Z',
    cab: 'M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11v6h-2v2h-2v-2H9v2H7v-2H5v-6Zm2.2 0h9.6l-1-3.2a1 1 0 0 0-1-.8H9.2a1 1 0 0 0-1 .8L7.2 11ZM7.5 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  }[m];
  return <svg className="mode-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden><path fill="currentColor" d={p} /></svg>;
}

export function Sheet({ onClose, children, title }: { onClose: () => void; children: ReactNode; title: string }) {
  const a = useA();
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h3>{title}</h3><button className="btn ghost" onClick={onClose}>{a.t('close')}</button></div>
        {children}
      </div>
    </div>
  );
}

/** One fact with its label and verified date; tap opens the full stamp and source (FR-BR-02). */
export function FactRow({ f, children, placeId, field, label }: { f?: Fact; children?: ReactNode; placeId?: string; field?: string; label?: string }) {
  const a = useA();
  const [open, setOpen] = useState(false);
  const [rep, setRep] = useState('');
  const [sent, setSent] = useState(false);
  if (!f) return null;
  const unavailable = isUnavailable(f) || (f.v === null && !f.t);
  const src = f.src ? a.data.sources[f.src] : undefined;
  const reported = placeId && field && a.reports.some((r) => r.placeId === placeId && r.field === field);
  return (
    <>
      <div className={`fact${unavailable ? ' is-unavailable' : ''}`} role="button" tabIndex={0} aria-haspopup="dialog"
        onClick={() => setOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}>
        {label && <span className="fact-label">{label}</span>}
        <span className="fact-value">{children ?? (unavailable ? a.l(f.why) || a.t('unavailable') : a.l(f.t))}</span>
        <span className="fact-meta">
          <Chip s={unavailable ? undefined : f.s} />
          {f.ver && !unavailable && <span className="muted">{a.t('verified')} {a.date(f.ver)}</span>}
        </span>
        {reported && <span className="fact-report">{a.t('reportedNote')}</span>}
      </div>
      {open && (
        <Sheet title={label ?? a.t('source')} onClose={() => setOpen(false)}>
          <dl className="stamp">
            <dt>{a.t('status')}</dt><dd><Chip s={unavailable ? undefined : f.s} /></dd>
            {unavailable && <><dt>{a.t('unavailable')}</dt><dd>{a.l(f.why)}</dd></>}
            {f.was && <><dt>{a.t('wasLabel')}</dt><dd><Chip s={f.was} /></dd></>}
            {src && <><dt>{a.t('source')}</dt><dd>{src.name}</dd><dt>{a.t('sourceType')}</dt><dd>{src.type}</dd><dt>{a.t('evidence')}</dt><dd>{src.evidence}</dd></>}
            {f.ver && <><dt>{a.t('verifiedAt')}</dt><dd>{a.date(f.ver)}</dd></>}
            <dt>{a.t('verifiedBy')}</dt><dd>{f.by ?? a.t('verifiedBy_default')}</dd>
            <dt>{a.t('dateRead')}</dt><dd>{a.date(a.data.city.readAt)}</dd>
            {f.ver && <><dt>{a.t('checkBy')}</dt><dd>{a.date(checkBy(f)!)}</dd></>}
          </dl>
          {!!f.alt?.length && (
            <>
              <h4>{a.t('otherValues')}</h4>
              <ul className="alts">
                {f.alt.map((x, i) => (
                  <li key={i}><div>{a.l(x.t)}</div><div className="fact-meta"><Chip s={x.s} /><span className="muted">{a.data.sources[x.src]?.name} · {a.date(x.ver)}</span></div></li>
                ))}
              </ul>
            </>
          )}
          {placeId && field && (
            <div className="report">
              <h4>{a.t('report')}</h4>
              {sent ? <p className="notice">{a.t('reportThanks')}</p> : (
                <>
                  <textarea value={rep} onChange={(e) => setRep(e.target.value)} placeholder={a.t('reportPh')} rows={2} maxLength={400} />
                  <button className="btn" disabled={!rep.trim()} onClick={() => { a.addReport({ placeId, field, text: rep.trim() }); setSent(true); }}>{a.t('send')}</button>
                </>
              )}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

export function Reasons({ reasons }: { reasons: Reason[] }) {
  const a = useA();
  return (
    <ul className="reasons">
      {reasons.map((r, i) => {
        const p = { ...r.p } as Record<string, string | number>;
        if (typeof p.dow === 'number') p.dow = a.dow(p.dow);
        for (const k of ['latest', 'open']) if (typeof p[k] === 'number') p[k] = fmt(p[k] as number);
        if (p.field) p.field = a.field(String(p.field));
        if (p.status) p.status = a.label(p.status as Label);
        return <li key={i}>{a.t(`r_${r.code}` as never, p)}</li>;
      })}
    </ul>
  );
}

export function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="brief-section">
      <h2><span className="sec-n">{n}</span>{title}</h2>
      {children}
    </section>
  );
}

export const rupees = (r: { min: number; max: number }) => (r.min === r.max ? `₹${r.min}` : `₹${r.min}–${r.max}`);
