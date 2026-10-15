import { useState } from 'react';
import { guardrail, type GuardStatus } from '../core';
import { useA } from '../store';
import { Chip } from '../ui/bits';

// Partner portal mock-up (FR-PT, FR-GR-05). Custodian flag changes apply at once and are logged.
export default function Partner() {
  const a = useA();
  const [tab, setTab] = useState<'custodian' | 'guide' | 'driver'>('custodian');
  const fields = tab === 'guide' ? ['yourName', 'licence', 'authority', 'languages', 'rate'] : ['yourName', 'vehicle', 'permit', 'policeCheck', 'fareRange'];
  return (
    <div className="page partner">
      <h1>{a.t('partnerTitle')}</h1>
      <p className="notice">{a.t('partnerNote')}</p>
      <div className="tabs" role="tablist">
        {(['custodian', 'guide', 'driver'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{a.t(`${t}Tab`)}</button>
        ))}
      </div>
      {tab === 'custodian' ? (
        <section className="card">
          <div className="table-wrap">
            <table className="guard">
              <thead><tr><th></th><th>{a.t('status_')}</th><th>{a.t('dailyLimit')}</th><th>{a.t('publication')}</th></tr></thead>
              <tbody>{a.data.places.map((p) => {
                const g = p.guardrail;
                const res = guardrail(p, a.today, a.counts);
                return (
                  <tr key={p.id}>
                    <th scope="row">{a.l(p.name)}{g.demo && <span className="demo">{a.t('demoValue')}</span>}</th>
                    <td>
                      <select value={g.status} aria-label={a.t('status_')} onChange={(e) => a.setGuardrail(p.id, { status: e.target.value as GuardStatus }, `status → ${e.target.value}`)}>
                        {(['level1', 'level2', 'withdrawn', 'notEligible'] as GuardStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {!res.ok && res.reason && res.reason !== 'notEligible' && res.reason !== 'withdrawn' && <span className="demo">{a.t(`gr_${res.reason}` as never)}</span>}
                    </td>
                    <td>{g.status === 'level2' ? <input type="number" min={0} className="num" value={g.dailyLimit ?? ''} placeholder={a.t('none')} aria-label={a.t('dailyLimit')}
                      onChange={(e) => { const v = e.target.value === '' ? null : Math.max(0, +e.target.value); a.setGuardrail(p.id, { dailyLimit: v }, `dailyLimit → ${v ?? 'none'}`); }} /> : <span className="muted">—</span>}</td>
                    <td className="small">{g.publication ? <><Chip s={g.publication.s} /> {a.data.sources[g.publication.src ?? '']?.name}</> : <span className="muted">{a.l(g.reason) || '—'}</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <h2>{a.t('changeLog')}</h2>
          {a.log.length ? <ul className="compact">{a.log.slice(0, 12).map((l, i) => <li key={i}><span className="muted small">{new Date(l.at).toLocaleString()}</span> {l.placeId}: {l.change}</li>)}</ul> : <p className="muted">{a.t('emptyQueue')}</p>}
        </section>
      ) : (
        <section className="card form-grid">
          {fields.map((f) => <label key={f}>{a.t(f as never)}<input disabled /></label>)}
          <p className="span2 muted small">{a.t('pending')}</p>
          <button className="btn span2" disabled>{a.t('submitMock')}</button>
        </section>
      )}
    </div>
  );
}
