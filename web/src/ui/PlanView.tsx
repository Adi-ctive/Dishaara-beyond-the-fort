import { useState } from 'react';
import { findAlternates, fmt, replan, type Alternate, type Leg, type Plan } from '../core';
import { useA } from '../store';
import { Chip, FactRow, ModeIcon, Reasons, VerdictBadge, rupees } from './bits';

function LegRow({ leg }: { leg: Leg }) {
  const a = useA();
  return (
    <li className="tl-leg">
      <span className="tl-dot leg" aria-hidden><ModeIcon m={leg.mode} /></span>
      <div className="leg-body">
        <div className="leg-main">
          <strong>{a.t(`m_${leg.mode}`)}</strong>
          <span>{a.t('legLine', { km: leg.km, min: leg.minutes, buf: leg.buffer })}</span>
          <Chip s="estimated" />
        </div>
        <div className="leg-fare">
          {leg.mode === 'walk' ? <span>₹0</span> : leg.fare && leg.fareBand ? (
            <FactRow f={leg.fareBand}>{rupees(leg.fare)} <span className="muted small">{a.t('perVehicles', { n: leg.vehicles })} · {a.l(leg.fareBand.t)}</span></FactRow>
          ) : <span className="warn small">{a.t('fareUnknown')}</span>}
        </div>
        {leg.flags.map((f) => <p key={f} className="warn small">{a.t(f)}</p>)}
      </div>
    </li>
  );
}

/** Plan summary, timeline and "Can't make it" alternates (FR-PL-05/06/07, FR-AL). */
export default function PlanView({ plan, onChange, compact }: { plan: Plan; onChange: (p: Plan) => void; compact?: boolean }) {
  const a = useA();
  const [alts, setAlts] = useState<{ i: number; list: Alternate[] } | null>(null);
  const [savedNote, setSavedNote] = useState('');
  const set = (p: Plan) => { onChange(p); setAlts(null); };
  return (
    <section className={`result${compact ? ' compact' : ''}`} aria-live="polite">
      <div className="card summary">
        <h2>{a.dateDow(plan.input.date)} · {a.t('planSummary', { n: plan.stops.length, start: fmt(plan.startMin), finish: fmt(plan.finish) })}</h2>
        <div className="budget">
          <div><span className="muted">{a.t('fees')}</span><strong>{rupees(plan.budget.fees)}</strong></div>
          <div><span className="muted">{a.t('fares')}</span><strong>{rupees(plan.budget.fares)}</strong></div>
          <div className="total"><span className="muted">{a.t('totalBudget')}</span><strong>{rupees(plan.budget.total)}</strong></div>
        </div>
        {plan.budget.total.partial && <p className="warn small">{a.t('partial')}</p>}
        {plan.needsConfirmation && <p className="flag">{a.t('planNeedsConfirm')}</p>}
      </div>

      {!plan.stops.length ? <p className="card">{a.t('emptyPlan')}</p> : (
        <ol className="timeline">
          <li className="tl-node"><span className="tl-dot" aria-hidden /><div><strong>{fmt(plan.startMin)}</strong> {a.t('start')}: {a.l(a.data.landmarks.find((l) => l.id === plan.input.startPoint)?.name)}</div></li>
          {plan.stops.map((s, i) => (
            <Fragment2 key={s.unit.id + i}>
              <LegRow leg={s.leg} />
              <li className={`tl-stop${s.needsConfirmation ? ' needs' : ''}`}>
                <span className="tl-dot stop" aria-hidden>{i + 1}</span>
                <div className="stop-card">
                  <div className="stop-time">{fmt(s.arrive)}–{fmt(s.depart)}</div>
                  <h3><a href={`#/place/${s.place.id}`}>{a.l(s.unit.name)}</a></h3>
                  {s.place.units.length > 1 && <p className="muted small">{a.l(s.place.name)}</p>}
                  <div className="row wrap"><VerdictBadge v={s.check.verdict} small />{s.added ? <span className="tag added">{a.t('addedByVisitor')}</span> : s.place.lesserKnown && <span className="tag lk">{a.t('lesserKnown')}</span>}</div>
                  {s.wait > 0 && <p className="small">{a.t('wait', { n: s.wait })}</p>}
                  <p className="muted small">{a.t('ticketVisit', { t: s.ticket, v: s.visit })}</p>
                  {s.check.verdict !== 'good' && <Reasons reasons={s.check.reasons} />}
                  <button className="btn ghost small" onClick={() => setAlts(alts?.i === i ? null : { i, list: findAlternates(a.data, plan, i) })}>{a.t('cantMake')}</button>
                  {alts?.i === i && (
                    <div className="alts-box">
                      <h4>{a.t('alternates')}</h4>
                      {alts.list.length ? (
                        <ul>{alts.list.map((x) => (
                          <li key={x.unit.id}>
                            <div><strong>{a.l(x.unit.name)}</strong> <VerdictBadge v={x.verdict as never} small /></div>
                            <p className="muted small">{a.t('altWhy', { match: x.match, travel: x.travel, arrive: fmt(x.arrive) })}</p>
                            <button className="btn small" onClick={() => set(replan(a.data, plan, i, x))}>{a.t('useThis')}</button>
                          </li>
                        ))}</ul>
                      ) : <p className="small">{a.t('noAlternates')}</p>}
                      <button className="btn ghost small" onClick={() => set(replan(a.data, plan, i, null))}>{a.t('dropStop')}</button>
                    </div>
                  )}
                </div>
              </li>
            </Fragment2>
          ))}
          {plan.returnLeg && <LegRow leg={plan.returnLeg} />}
          <li className="tl-node"><span className="tl-dot end" aria-hidden /><div><strong>{fmt(plan.finish)}</strong> {a.t('end')}</div></li>
        </ol>
      )}

      {!!plan.leftOut.length && (
        <details className="card left-out">
          <summary>{a.t('leftOut')} ({plan.leftOut.length})</summary>
          <ul>{plan.leftOut.map((l) => <li key={l.unit.id}><a href={`#/place/${l.place.id}`}>{a.l(l.unit.name)}</a>: {a.t(`lo_${l.reason}` as never)}</li>)}</ul>
        </details>
      )}

      <div className="save-row">
        <button className="btn" onClick={() => {
          if (!a.user) { setSavedNote(a.t('signInToSave')); return; }
          a.savePlan({ date: plan.input.date, places: plan.stops.map((s) => s.place.id), added: plan.stops.filter((s) => s.added).map((s) => s.place.id) });
          setSavedNote(a.t('saved'));
        }}>{a.t('save')}</button>
        {savedNote && <span className="muted small">{savedNote}</span>}
      </div>
    </section>
  );
}

const Fragment2 = ({ children }: { children: React.ReactNode }) => <>{children}</>;
