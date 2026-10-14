import { useEffect, useState } from 'react';
import { buildPlan, parseTrip, type Mode, type Plan as P } from '../core';
import { useA } from '../store';
import { ModeIcon } from '../ui/bits';
import PlanView from '../ui/PlanView';

export default function Plan() {
  const a = useA();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'ask' | 'nc'; opts?: [string, string]; date?: string; actual?: number } | null>(null);
  const [form, setForm] = useState({
    date: a.today, start: '09:00', hours: 7, startPoint: 'station', returnToStart: true,
    modes: ['walk', 'auto', 'cab'] as Mode[], group: { indian: 2, foreign: 0, child: 0 }, payment: 'online' as 'cash' | 'online',
  });
  const [plan, setPlan] = useState<P | null>(null);

  const build = (f = form) => { setPlan(buildPlan(a.data, { ...f, profile: a.profile, counts: a.counts })); };

  // ?sample in the URL builds a sample plan straight away (judges' shortcut).
  useEffect(() => { if (new URLSearchParams(location.search).has('sample')) build(); }, []); // eslint-disable-line

  const parse = (src = text) => {
    const r = parseTrip(src, a.today);
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
      <p className="muted">{a.t('planAdvanced')}</p>

      <section className="card">
        <label htmlFor="trip" className="lbl">{a.t('describe')}</label>
        <textarea id="trip" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={a.t('describePh')} />
        <button className="btn" onClick={() => parse()} disabled={!text.trim()}>{a.t('fill')}</button>
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
          {' '}<a href="#/you">{a.t('editProfile')}</a>
        </p>
        <button className="btn primary span2" onClick={() => build()} disabled={!form.modes.length || !(form.group.indian + form.group.foreign + form.group.child)}>{a.t('build')}</button>
      </section>

      {plan && <PlanView plan={plan} onChange={setPlan} />}
    </div>
  );
}
