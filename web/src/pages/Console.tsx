import { useMemo, useState } from 'react';
import { LABELS, isUnavailable, type Fact } from '../core';
import { useA } from '../store';
import { Chip, FactRow } from '../ui/bits';

// Verification console (FR-AD): conflicts, stale facts from the daily job, visitor reports.
export default function Console() {
  const a = useA();
  const [d, setD] = useState(a.asOf);
  const name = (id: string) => a.l(a.data.places.find((p) => p.id === id)?.name) || id;
  const conflicts = a.queue.filter((q) => q.kind === 'conflict');
  const stale = a.queue.filter((q) => q.kind === 'stale');
  const unavailable = useMemo(() => {
    const out: { placeId: string; path: string; f: Fact }[] = [];
    const walk = (n: unknown, placeId: string, path: string) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach((x, i) => walk(x, placeId, `${path}[${i}]`));
      const o = n as Record<string, unknown>;
      if (typeof o.cls === 'string' && isUnavailable(o as unknown as Fact)) out.push({ placeId, path, f: o as unknown as Fact });
      for (const [k, v] of Object.entries(o)) if (k !== 'alt') walk(v, placeId, `${path}.${k}`);
    };
    a.data.places.forEach((p) => walk(p, p.id, p.id));
    return out;
  }, [a.data]);

  const Queue = ({ title, items }: { title: string; items: { placeId: string; path: string; fact: Fact }[] }) => (
    <section className="card queue">
      <h2>{title} <span className="count">{items.length}</span></h2>
      {items.length ? <ul>{items.map((q, i) => (
        <li key={i}><div className="q-head"><strong>{name(q.placeId)}</strong><code>{q.path.split('.').slice(1).join('.')}</code></div><FactRow f={q.fact} /></li>
      ))}</ul> : <p className="muted">{a.t('emptyQueue')}</p>}
    </section>
  );

  return (
    <div className="page console">
      <h1>{a.t('consoleTitle')}</h1>
      <form className="card row wrap" onSubmit={(e) => { e.preventDefault(); a.setAsOf(d || a.today); }}>
        <label>{a.t('asOf')}<input type="date" value={d} onChange={(e) => setD(e.target.value)} /></label>
        <button className="btn primary">{a.t('runJob')}</button>
      </form>
      <div className="queues">
        <Queue title={a.t('q_conflicts')} items={conflicts} />
        <Queue title={a.t('q_stale')} items={stale} />
        <section className="card queue">
          <h2>{a.t('q_reports')} <span className="count">{a.reports.length}</span></h2>
          {a.reports.length ? <ul>{a.reports.map((r) => (
            <li key={r.id}><div className="q-head"><strong>{name(r.placeId)}</strong><code>{r.field}</code></div><p>{r.text}</p><p className="muted small">{new Date(r.at).toLocaleString()}</p></li>
          ))}</ul> : <p className="muted">{a.t('emptyQueue')}</p>}
        </section>
        <section className="card queue">
          <h2>{a.t('q_unavailable')} <span className="count">{unavailable.length}</span></h2>
          <ul className="compact">{unavailable.map((u, i) => (
            <li key={i}><strong>{name(u.placeId)}</strong> <code>{u.path.split('.').slice(1).join('.')}</code> <span className="muted small">{a.l(u.f.why)}</span></li>
          ))}</ul>
        </section>
      </div>
      <section className="card">
        <h2>{a.t('labelsTitle')}</h2>
        <div className="chips-row">{LABELS.map((l) => <Chip key={l} s={l} />)}<Chip /></div>
      </section>
    </div>
  );
}
