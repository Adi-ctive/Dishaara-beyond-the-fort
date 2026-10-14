import { useState } from 'react';
import { useA } from '../store';

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
              <thead><tr><th></th><th>{a.t('visitorReady')}</th><th>{a.t('dailyLimit')}</th><th>{a.t('consent')}</th></tr></thead>
              <tbody>{a.data.places.map((p) => {
                const g = p.guardrail;
                return (
                  <tr key={p.id}>
                    <th scope="row">{a.l(p.name)}<span className="demo">{a.t('demoValue')}</span></th>
                    <td><input type="checkbox" checked={g.visitorReady} aria-label={a.t('visitorReady')} onChange={(e) => a.setGuardrail(p.id, { visitorReady: e.target.checked }, `visitorReady → ${e.target.checked}`)} /></td>
                    <td><input type="number" min={0} className="num" value={g.dailyLimit ?? ''} placeholder={a.t('none')} aria-label={a.t('dailyLimit')}
                      onChange={(e) => { const v = e.target.value === '' ? null : Math.max(0, +e.target.value); a.setGuardrail(p.id, { dailyLimit: v }, `dailyLimit → ${v ?? 'none'}`); }} /></td>
                    <td>{g.consentRequired ? <input type="checkbox" checked={!!g.consent} aria-label={a.t('consent')} onChange={(e) => a.setGuardrail(p.id, { consent: e.target.checked }, `consent → ${e.target.checked}`)} /> : <span className="muted">—</span>}</td>
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
