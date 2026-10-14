import { useMemo, useState } from 'react';
import { bestVerdict, checkUnit, guardrail, isCovered } from '../core';
import { useA } from '../store';
import { VerdictBadge } from '../ui/bits';

export const TAGS = ['architecture', 'temples', 'museums', 'royal', 'music', 'spiritual'] as const;

export default function Home() {
  const a = useA();
  const [city, setCity] = useState(a.l(a.data.city.name));
  const [cityOk, setCityOk] = useState(true);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return a.data.places.filter((p) => {
      const hit = !needle || [p.name.en, p.name.hi, p.type.en, p.type.hi].some((s) => s.toLowerCase().includes(needle));
      // FR-GR-03: unflagged places appear only when searched for, never in discovery lists.
      if (!guardrail(p, a.today).ok && (!needle || !hit)) return false;
      return hit && (!tag || p.tags.includes(tag));
    });
  }, [a.data, a.today, q, tag]);

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-art" aria-hidden />
        <p className="eyebrow">{a.t('tagline')}</p>
        <form className="city" onSubmit={(e) => { e.preventDefault(); setCityOk(isCovered(city)); }}>
          <label htmlFor="city">{a.t('whichCity')}</label>
          <div className="row">
            <input id="city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="off" />
            <button className="btn">{a.t('go')}</button>
          </div>
        </form>
      </section>

      {!cityOk ? (
        <div className="card not-covered">
          <h2>{a.t('notCovered')}</h2>
          <p>{a.t('notCoveredBody')}</p>
        </div>
      ) : (
        <>
          <div className="filters">
            <input type="search" placeholder={a.t('search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={a.t('search')} />
            <div className="chips-row" role="group">
              <button className={`pill${!tag ? ' on' : ''}`} onClick={() => setTag(null)} aria-pressed={!tag}>{a.t('all')}</button>
              {TAGS.map((t) => (
                <button key={t} className={`pill${tag === t ? ' on' : ''}`} onClick={() => setTag(tag === t ? null : t)} aria-pressed={tag === t}>{a.t(`tag_${t}`)}</button>
              ))}
            </div>
          </div>
          <ul className="place-grid">
            {list.map((p, i) => {
              const g = guardrail(p, a.today);
              const v = bestVerdict(p.units.map((u) => checkUnit(a.data, u, a.today).verdict));
              return (
                <li key={p.id} style={{ animationDelay: `${i * 40}ms` }}>
                  <a className="place-card" href={`#/place/${p.id}`}>
                    <div className={`place-thumb thumb-${p.tags[0]}`} aria-hidden><span>{a.l(p.name).slice(0, 1)}</span></div>
                    <div className="place-body">
                      <h3>{a.l(p.name)}</h3>
                      <p className="muted">{a.l(p.type)}</p>
                      <div className="tags">
                        {p.lesserKnown && <span className="tag lk">{a.t('lesserKnown')}</span>}
                        {p.tags.map((t) => <span key={t} className="tag">{a.t(`tag_${t}` as never)}</span>)}
                        {p.units.length > 1 && <span className="tag">{p.units.length} {a.t('sections')}</span>}
                      </div>
                      <div className="today"><span className="muted">{a.t('todayVerdict')}:</span> <VerdictBadge v={v} small /></div>
                      {!g.ok && <p className="warn small">{a.t('describedOnly')}</p>}
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
