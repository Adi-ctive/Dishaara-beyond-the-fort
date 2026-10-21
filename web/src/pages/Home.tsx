import { useMemo, useState } from 'react';
import { bestVerdict, checkUnit, guardrail, isCovered, promotable, searchByName } from '../core';
import { useA } from '../store';
import { AddToPlan } from '../ui/Added';
import { VerdictBadge } from '../ui/bits';

export const TAGS = ['architecture', 'temples', 'museums', 'royal', 'music', 'spiritual'] as const;

export default function Home() {
  const a = useA();
  const [city, setCity] = useState(a.l(a.data.city.name));
  const [cityOk, setCityOk] = useState(true);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');

  // Decision 28 (FR-VO-08): search by name only, exact or near match, no suggestions while typing.
  // With no search, the only list is custodian-flagged (Level 2) places: Level 1 gets no list placement (Decision 25).
  const needle = q.trim();
  const list = useMemo(() => needle
    ? searchByName(a.data, needle).map((id) => a.data.places.find((p) => p.id === id)!)
    : a.data.places.filter((p) => promotable(p, a.today, a.counts)), [a.data, a.today, a.counts, needle]);

  return (
    <div className="page">
      <p className="demo-banner">{a.t('demoBanner')}</p>
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
          <form className="filters" onSubmit={(e) => { e.preventDefault(); setQ(draft); }} role="search">
            <div className="row">
              <input type="search" placeholder={a.t('searchByName')} value={draft} onChange={(e) => { setDraft(e.target.value); if (!e.target.value) setQ(''); }} aria-label={a.t('searchByName')} autoComplete="off" />
              <button className="btn">{a.t('find')}</button>
            </div>
            <p className="muted small">{a.t('nameOnly')}</p>
          </form>
          <h2 className="list-title">{needle ? a.t('resultsFor', { q: needle }) : a.t('flaggedList')}</h2>
          {!list.length && <p className="card muted">{needle ? a.t('noNameMatch') : a.t('noFlagged')}</p>}
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
                      {!g.ok && <p className="warn small">{a.t('describedOnly')} {p.guardrail.reason ? a.l(p.guardrail.reason) : g.reason ? a.t(`gr_${g.reason}` as never) : ''}</p>}
                    </div>
                  </a>
                  {needle && <AddToPlan place={p} />}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
