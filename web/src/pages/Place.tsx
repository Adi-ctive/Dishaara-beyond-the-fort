import { useState } from 'react';
import { checkUnit, fmt, guardrail, haversineKm, ROAD_FACTOR, sunTimes, toMin, type Fees, type Place as P, type Unit } from '../core';
import { useA } from '../store';
import { Chip, FactRow, Reasons, Section, VerdictBadge } from '../ui/bits';

function FeeTable({ fees }: { fees: Fees }) {
  const a = useA();
  const cell = (n?: number | null) => (n === null || n === undefined ? <span className="muted">—</span> : n === 0 ? a.t('free') : `₹${n}`);
  return (
    <table className="fees">
      <thead><tr><th>{a.t('visitor')}</th><th>{a.t('cash')}</th><th>{a.t('online')}</th></tr></thead>
      <tbody>
        {fees.rows.map((r, i) => (
          <tr key={i}>
            <th scope="row">{a.l(r.label)}</th>
            {r.any !== undefined ? <td colSpan={2}>{cell(r.any)}</td> : <><td>{cell(r.cash)}</td><td>{cell(r.online)}</td></>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UnitBlock({ u, place, date, multi }: { u: Unit; place: P; date: string; multi: boolean }) {
  const a = useA();
  const sun = u.hours.v?.kind === 'sun' ? sunTimes(date, u.coord[0], u.coord[1], a.data.city.tz) : null;
  return (
    <div className={multi ? 'unit' : ''}>
      {multi && <h3 className="unit-name">{a.l(u.name)}</h3>}
      <FactRow f={u.custodian} label={a.t('custodian')} placeId={place.id} field={`${u.id}.custodian`} />
      <FactRow f={u.hours} label={a.t('hours')} placeId={place.id} field={`${u.id}.hours`} />
      {sun && <p className="calc">{a.t('sunOn', { date: a.date(date), rise: fmt(sun.rise), set: fmt(sun.set) })}</p>}
      <FactRow f={u.weeklyClosed} label={a.t('weeklyClosed')} placeId={place.id} field={`${u.id}.weeklyClosed`} />
      <FactRow f={u.lastEntry} label={a.t('lastEntry')} placeId={place.id} field={`${u.id}.lastEntry`} />
    </div>
  );
}

export default function Place({ id }: { id: string }) {
  const a = useA();
  const place = a.data.places.find((p) => p.id === id);
  const [date, setDate] = useState(a.today);
  const [arrival, setArrival] = useState('');
  if (!place) return <div className="page"><p>{a.t('notCovered')}</p></div>;
  const multi = place.units.length > 1;
  const g = guardrail(place, date, a.counts);
  const results = place.units.map((u) => ({ u, r: checkUnit(a.data, u, date, { arrival: arrival ? toMin(arrival) : undefined, pace: a.profile.pace }) }));
  const station = a.data.landmarks.find((l) => l.id === 'station')!;
  const nearby = a.data.places
    .filter((p) => p.id !== place.id && guardrail(p, date, a.counts).ok)
    .map((p) => ({ p, km: Math.round(haversineKm(place.units[0].coord, p.units[0].coord) * ROAD_FACTOR * 10) / 10 }))
    .sort((x, y) => x.km - y.km).slice(0, 3);
  const srcIds = new Set<string>();
  JSON.stringify(place, (k, v) => { if (k === 'src' && typeof v === 'string') srcIds.add(v); return v; });
  const rules = (kind: string) => place.rules.filter((r) => r.kind === kind);

  return (
    <div className="page place">
      <a className="back" href="#/">← {a.t('back')}</a>
      <header className="place-head">
        <p className="eyebrow">{a.l(place.type)}</p>
        <h1>{a.l(place.name)}</h1>
        <div className="tags">
          {place.lesserKnown && <span className="tag lk">{a.t('lesserKnown')}</span>}
          {place.tags.map((t) => <span key={t} className="tag">{a.t(`tag_${t}` as never)}</span>)}
        </div>
        {!g.ok && <p className="warn">{a.t('describedOnly')}</p>}
      </header>

      <section className="card check" aria-labelledby="chk">
        <h2 id="chk">{a.t('canIVisit')}</h2>
        <div className="row wrap">
          <label>{a.t('date')}<input type="date" value={date} onChange={(e) => setDate(e.target.value || a.today)} /></label>
          <label>{a.t('arrival')}<input type="time" value={arrival} onChange={(e) => setArrival(e.target.value)} /></label>
        </div>
        <ul className="verdicts">
          {results.map(({ u, r }) => (
            <li key={u.id}>
              <div className="verdict-line">{multi && <strong>{a.l(u.name)}</strong>}<VerdictBadge v={r.verdict} /></div>
              <Reasons reasons={r.reasons} />
              {!!r.notes.length && <><p className="muted small">{a.t('notes')}:</p><Reasons reasons={r.notes} /></>}
            </li>
          ))}
        </ul>
      </section>

      <Section n={1} title={a.t('b_status')}>
        <FactRow f={place.summary} placeId={place.id} field="summary" />
        {place.notes.map((n, i) => <FactRow key={i} f={n} placeId={place.id} field={`note${i}`} />)}
        {place.popularity && <FactRow f={place.popularity} />}
      </Section>

      <Section n={2} title={a.t('b_hours')}>
        {place.units.map((u) => <UnitBlock key={u.id} u={u} place={place} date={date} multi={multi} />)}
      </Section>

      <Section n={3} title={a.t('b_fees')}>
        {place.units.map((u) => (
          <div key={u.id} className={multi ? 'unit' : ''}>
            {multi && <h3 className="unit-name">{a.l(u.name)} <span className="muted small">· {a.t('ticket')}: {u.ticket}</span></h3>}
            <FactRow f={u.fees} placeId={place.id} field={`${u.id}.fees`}>
              {u.fees.v ? <FeeTable fees={u.fees.v} /> : undefined}
            </FactRow>
            {u.coverage && <FactRow f={u.coverage} label={a.t('coverage')} />}
            <FactRow f={u.payment} label={a.t('payment')} placeId={place.id} field={`${u.id}.payment`} />
          </div>
        ))}
      </Section>

      <Section n={4} title={a.t('b_duration')}>
        {place.units.map((u) => (
          <FactRow key={u.id} f={u.minVisit} label={multi ? a.l(u.name) : undefined}>{a.t('minVisit', { min: u.minVisit.v ?? '—', rec: u.minVisit.rec ?? '—' })}</FactRow>
        ))}
      </Section>

      <Section n={5} title={a.t('b_getting')}>
        {a.data.stationFares.filter((f) => f.place === place.id).map((f, i) => (
          <FactRow key={i} f={f} label={`${a.t('fromStation')} → ${a.l(f.to)}`} />
        ))}
        <FactRow f={{ cls: 'fare', s: 'estimated', src: 'team-estimate', ver: '2026-10-14', t: { en: '', hi: '' } }} label={a.l(station.name)}>
          ≈ {Math.round(haversineKm(station.coord, place.units[0].coord) * ROAD_FACTOR * 10) / 10} {a.t('km')}
        </FactRow>
        <p className="muted small">{a.t('coordNote')}</p>
      </Section>

      <Section n={6} title={a.t('b_food')}>
        <FactRow f={place.facilities} />
      </Section>

      <Section n={7} title={a.t('b_safety')}>
        {(['mandatory', 'safety', 'courtesy'] as const).map((k) => (
          <div key={k} className="rule-group">
            <h3>{a.t(k)}</h3>
            {rules(k).length ? rules(k).map((r, i) => <FactRow key={i} f={r} placeId={place.id} field={`rule-${k}${i}`} />) : <p className="muted small">{a.t('noRules')}</p>}
          </div>
        ))}
        <p className="emergency">{a.t('emergency')}</p>
        <FactRow f={place.contact} label={a.t('contact')} />
        <FactRow f={place.accessibility} label={a.t('accessibility')}>{a.t('notVerified')}</FactRow>
      </Section>

      <Section n={8} title={a.t('b_budget')}>
        <p className="muted small">{a.t('perPerson')}</p>
        <ul className="budget-lines">
          {place.units.map((u) => (
            <li key={u.id}>
              <span>{a.l(u.name)}</span>
              <span>{u.fees.v ? u.fees.v.rows.filter((r) => r.who === 'indian').map((r) => r.any ?? r.online ?? r.cash).map((n) => (n === null || n === undefined ? '—' : `₹${n}`)).join(' / ') : <Chip />}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section n={9} title={a.t('b_nearby')}>
        <ul className="nearby">
          {nearby.map(({ p, km }) => (
            <li key={p.id}><a href={`#/place/${p.id}`}>{a.l(p.name)}</a><span className="muted">≈ {km} {a.t('km')} <Chip s="estimated" /></span></li>
          ))}
        </ul>
      </Section>

      <Section n={10} title={a.t('b_sources')}>
        <ul className="sources">
          {[...srcIds].map((s) => a.data.sources[s] && (
            <li key={s}><strong>{a.data.sources[s].name}</strong><span className="muted"> · {a.data.sources[s].type} · {a.data.sources[s].evidence}</span></li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
