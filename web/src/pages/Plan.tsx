import { useState } from 'react';
import { buildPlan, findAlternates, fmt, parseTrip, replan, type Alternate, type Leg, type Mode, type Plan as P } from '../core';
import { useA } from '../store';
import { Chip, FactRow, ModeIcon, Reasons, VerdictBadge, rupees } from '../ui/bits';

type AltState = { i: number; list: Alternate[] } | null;

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

export default function Plan() {
  const a = useA();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'ask' | 'nc'; opts?: [string, string]; date?: string; actual?: number } | null>(null);
  const [form, setForm] = useState({
    date: a.today, start: '09:00', hours: 7, startPoint: 'station', returnToStart: true,
    modes: ['walk', 'auto', 'cab'] as Mode[], group: { indian: 2, foreign: 0, child: 0 }, payment: 'online' as 'cash' | 'online',
  });
  const [plan, setPlan] = useState<P | null>(null);
  const [alts, setAlts] = useState<AltState>(null);
  const [savedNote, setSavedNote] = useState('');

  const build = (f = form) => { setPlan(buildPlan(a.data, { ...f, profile: a.profile, counts: a.counts })); setAlts(null); setSavedNote(''); };

  const parse = () => {
    const r = parseTrip(text, a.today);
    if (r.uncoveredCity) { setMsg({ kind: 'nc' }); setPlan(null); return; }
    const next = { ...form, ...(r.date && { date: r.date }), ...(r.hours && { hours: r.hours }), ...(r.start && { start: r.start }), ...(r.startPoint && { startPoint: r.startPoint }) };
    setForm(next);
    if (r.mismatch) { setMsg({ kind: 'ask', opts: r.mismatch.options, date: r.mismatch.date, actual: r.mismatch.actual }); setPlan(null); return; }
    setMsg({ kind: 'ok' });
    build(next);
  };
  const choose = (d: string) => { const next = { ...form, date: d }; setForm(next); setMsg({ kind: 'ok' }); build(next); };
  const toggleMode = (m: Mode) => setForm({ ...form, modes: form.modes.includes(m) ? form.modes.filter((x) => x !== m) : [...form.modes, m] });
  const setGroup = (k: keyof typeof form.group, d: number) => setForm({ ...form, group: { ...form.group, [k]: Math.max(0, Math.min(20, form.group[k] + d)) } });

  return (
    <div className="page plan">
      <h1>{a.t('planTitle')}</h1>

      <section className="card">
        <label htmlFor="trip" className="lbl">{a.t('describe')}</label>
        <textarea id="trip" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={a.t('describePh')} />
        <button className="btn" onClick={parse} disabled={!text.trim()}>{a.t('fill')}</button>
        {msg?.kind === 'ask' && msg.opts && (
          <div className="ask" role="alert">
            <p>{a.t('askDate', { date: a.date(msg.date!), actual: a.dow(msg.actual!), opt1: a.dateDow(msg.opts[0]), opt2: a.dateDow(msg.opts[1]) })}</p>
            <div className="row">{msg.opts.map((o) => <button key={o} className="btn ghost" onClick={() => choose(o)}>{a.dateDow(o)}</button>)}</div>
          </div>
        )}
        {msg?.kind === 'nc' && <div className="not-covered inline"><strong>{a.t('notCovered')}</strong><p>{a.t('notCoveredBody')}</p></div>}
        {msg?.kind === 'ok' && <p className="muted small">{a.t('parsedOk')}</p>}
      </section>

      <section className="card form-grid">
        <label>{a.t('date')}<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value || a.today })} /></label>
        <label>{a.t('startTime')}<input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value || '09:00' })} /></label>
        <label className="span2">{a.t('hoursAvail')}: <strong>{form.hours}</strong>
          <input type="range" min={1} max={14} step={0.5} value={form.hours} onChange={(e) => setForm({ ...form, hours: +e.target.value })} />
        </label>
        <label>{a.t('startPoint')}
          <select value={form.startPoint} onChange={(e) => setForm({ ...form, startPoint: e.target.value })}>
            {a.data.landmarks.map((l) => <option key={l.id} value={l.id}>{a.l(l.name)}</option>)}
          </select>
        </label>
        <label className="check-inline"><input type="checkbox" checked={form.returnToStart} onChange={(e) => setForm({ ...form, returnToStart: e.target.checked })} /> {a.t('returnStart')}</label>
        <fieldset className="span2"><legend>{a.t('modes')}</legend>
          <div className="chips-row">{(['walk', 'auto', 'cab'] as Mode[]).map((m) => (
            <button key={m} type="button" className={`pill${form.modes.includes(m) ? ' on' : ''}`} aria-pressed={form.modes.includes(m)} onClick={() => toggleMode(m)}><ModeIcon m={m} /> {a.t(`m_${m}`)}</button>
          ))}</div>
        </fieldset>
        <fieldset className="span2"><legend>{a.t('group')}</legend>
          {(['indian', 'foreign', 'child'] as const).map((k) => (
            <div key={k} className="stepper"><span>{a.t(`g_${k}`)}</span>
              <button type="button" className="btn ghost sq" onClick={() => setGroup(k, -1)} aria-label="−">−</button>
              <output>{form.group[k]}</output>
              <button type="button" className="btn ghost sq" onClick={() => setGroup(k, 1)} aria-label="+">+</button>
            </div>
          ))}
        </fieldset>
        <fieldset className="span2"><legend>{a.t('payWith')}</legend>
          <div className="chips-row">{(['online', 'cash'] as const).map((p) => (
            <button key={p} type="button" className={`pill${form.payment === p ? ' on' : ''}`} aria-pressed={form.payment === p} onClick={() => setForm({ ...form, payment: p })}>{a.t(p)}</button>
          ))}</div>
        </fieldset>
        <p className="span2 muted small">
          {a.hasProfile ? `${a.t('usingProfile')}: ${[...a.profile.likes.map((t) => '+' + a.t(`tag_${t}` as never)), ...a.profile.dislikes.map((t) => '−' + a.t(`tag_${t}` as never))].join(' ') || '—'} · ${a.t(`p_${a.profile.pace}`)}` : a.t('noProfile')}
          {' '}<a href="#/profile">{a.t('editProfile')}</a>
        </p>
        <button className="btn primary span2" onClick={() => build()} disabled={!form.modes.length || !(form.group.indian + form.group.foreign + form.group.child)}>{a.t('build')}</button>
      </section>

      {plan && (
        <section className="result" aria-live="polite">
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
                <FragmentStop key={s.unit.id + i} i={i} plan={plan} alts={alts} setAlts={setAlts} onPlan={(p) => { setPlan(p); setAlts(null); }} />
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
              a.savePlan({ date: plan.input.date, places: plan.stops.map((s) => s.place.id) });
              setSavedNote(a.t('saved'));
            }}>{a.t('save')}</button>
            {savedNote && <span className="muted small">{savedNote} {!a.user && <a href="#/profile">{a.t('signIn')}</a>}</span>}
          </div>
        </section>
      )}
    </div>
  );

  function FragmentStop({ i, plan, alts, setAlts, onPlan }: { i: number; plan: P; alts: AltState; setAlts: (x: AltState) => void; onPlan: (p: P) => void }) {
    const s = plan.stops[i];
    return (
      <>
        <LegRow leg={s.leg} />
        <li className={`tl-stop${s.needsConfirmation ? ' needs' : ''}`}>
          <span className="tl-dot stop" aria-hidden>{i + 1}</span>
          <div className="stop-card">
            <div className="stop-time">{fmt(s.arrive)}–{fmt(s.depart)}</div>
            <h3><a href={`#/place/${s.place.id}`}>{a.l(s.unit.name)}</a></h3>
            {s.place.units.length > 1 && <p className="muted small">{a.l(s.place.name)}</p>}
            <div className="row wrap"><VerdictBadge v={s.check.verdict} small />{s.place.lesserKnown && <span className="tag lk">{a.t('lesserKnown')}</span>}</div>
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
                      <button className="btn small" onClick={() => onPlan(replan(a.data, plan, i, x))}>{a.t('useThis')}</button>
                    </li>
                  ))}</ul>
                ) : <p className="small">{a.t('noAlternates')}</p>}
                <button className="btn ghost small" onClick={() => onPlan(replan(a.data, plan, i, null))}>{a.t('dropStop')}</button>
              </div>
            )}
          </div>
        </li>
      </>
    );
  }
}
