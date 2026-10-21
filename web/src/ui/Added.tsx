import { useState } from 'react';
import type { Place } from '../core';
import { useA } from '../store';
import { FactRow } from './bits';

/** FR-BR-08: for a place of worship, contested or residential site, the rules come before the visit details. */
export function SensitiveRules({ place }: { place: Place }) {
  const a = useA();
  const s = place.sensitive;
  if (!s) return null;
  const u = place.units[0];
  return (
    <section className="card rules-first" aria-labelledby={`rf-${place.id}`}>
      <h2 id={`rf-${place.id}`}>{a.t('rulesFirst')}</h2>
      <p>{a.t(`sens_${s.kind}`)}</p>
      <FactRow f={u.custodian} label={a.t('custodian')} />
      <FactRow f={u.hours} label={a.t('accessNow')} />
      <FactRow f={s.dress} label={a.t('dress')} />
      {s.worship && <FactRow f={s.worship} label={a.t('worshipTimes')} />}
    </section>
  );
}

/** "Add to my plan" for any place found by name (FR-PL-12). Excluded categories show their rules first. */
export function AddToPlan({ place, rulesShown }: { place: Place; rulesShown?: boolean }) {
  const a = useA();
  const [reading, setReading] = useState(false);
  if (a.added.includes(place.id)) {
    return (
      <div className="add-row">
        <span className="tag added">{a.t('inYourPlan')}</span>
        <button className="btn ghost small" onClick={() => a.removePlace(place.id)}>{a.t('removeFromPlan')}</button>
      </div>
    );
  }
  if (reading) {
    return (
      <div className="add-confirm">
        <SensitiveRules place={place} />
        <div className="row">
          <button className="btn small" onClick={() => { a.addPlace(place.id); setReading(false); }}>{a.t('addAfterRules')}</button>
          <button className="btn ghost small" onClick={() => setReading(false)}>{a.t('cancel')}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="add-row">
      <button className="btn small" onClick={() => (place.sensitive && !rulesShown ? setReading(true) : a.addPlace(place.id))}>{a.t('addToPlan')}</button>
      <span className="muted small">{a.t('addedNote')}</span>
    </div>
  );
}
