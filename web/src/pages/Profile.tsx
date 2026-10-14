import { useState } from 'react';
import type { Budget, Pace, Profile as Pr, Walking } from '../core';
import { GROQ_MODEL } from '../chat/engine';
import { useA } from '../store';
import { TAGS } from './Home';

/** Taste profile form (FR-VO-03): interests (like / dislike), pace, walking, budget. */
export function TasteForm({ part = 'all', value, onChange }: { part?: 'all' | 'likes' | 'style'; value: Pr; onChange: (p: Pr) => void }) {
  const a = useA();
  const p = value;
  const cycle = (t: string) => {
    const like = p.likes.includes(t), dis = p.dislikes.includes(t);
    if (!like && !dis) onChange({ ...p, likes: [...p.likes, t] });
    else if (like) onChange({ ...p, likes: p.likes.filter((x) => x !== t), dislikes: [...p.dislikes, t] });
    else onChange({ ...p, dislikes: p.dislikes.filter((x) => x !== t) });
  };
  const opt = <K extends 'pace' | 'walking' | 'budget'>(k: K, vals: Pr[K][], key: (v: Pr[K]) => string) => (
    <fieldset><legend>{a.t(k)}</legend>
      <div className="chips-row">{vals.map((v) => (
        <button key={v} type="button" className={`pill${p[k] === v ? ' on' : ''}`} aria-pressed={p[k] === v} onClick={() => onChange({ ...p, [k]: v })}>{key(v)}</button>
      ))}</div>
    </fieldset>
  );
  return (
    <>
      {part !== 'style' && (
        <>
          <p className="muted small">{a.t('tasteHint')}</p>
          <div className="chips-row big">
            {TAGS.map((t) => {
              const st = p.likes.includes(t) ? 'like' : p.dislikes.includes(t) ? 'dislike' : '';
              return <button key={t} type="button" className={`pill ${st}`} onClick={() => cycle(t)}>{st === 'like' ? '♥ ' : st === 'dislike' ? '✕ ' : ''}{a.t(`tag_${t}`)}{st && <span className="sr"> ({a.t(st)})</span>}</button>;
            })}
          </div>
        </>
      )}
      {part !== 'likes' && (
        <>
          {opt('pace', ['relaxed', 'normal', 'fast'] as Pace[], (v) => a.t(`p_${v}`))}
          {opt('walking', ['low', 'medium', 'high'] as Walking[], (v) => a.t(`w_${v}`))}
          {opt('budget', ['low', 'medium', 'high'] as Budget[], (v) => a.t(`bu_${v}`))}
        </>
      )}
    </>
  );
}

function AiKey() {
  const a = useA();
  const [key, setKey] = useState('');
  const [state, setState] = useState<'' | 'ok' | 'bad' | 'busy'>('');
  const save = async () => {
    setState('busy');
    try {
      const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key.trim()}` } });
      const ok = r.ok && (await r.json()).data?.some((m: { id: string }) => m.id === GROQ_MODEL);
      if (ok) { a.setGroqKey(key.trim()); setKey(''); }
      setState(ok ? 'ok' : 'bad');
    } catch { setState('bad'); }
  };
  return (
    <section className="card" id="ai">
      <h2>{a.t('aiTitle')}</h2>
      <p className="muted small">{a.t('aiBody')}</p>
      {a.groqKey ? (
        <div className="row between wrap"><p className="notice">✓ {a.t('aiStored')}</p><button className="btn ghost" onClick={() => { a.setGroqKey(''); setState(''); }}>{a.t('aiRemove')}</button></div>
      ) : (
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); if (key.trim()) save(); }}>
          <label>{a.t('aiKey')}<input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="gsk_…" autoComplete="off" spellCheck={false} /></label>
          <button className="btn" disabled={!key.trim() || state === 'busy'}>{a.t('aiSave')}</button>
        </form>
      )}
      {state === 'ok' && <p className="notice">{a.t('aiOk')}</p>}
      {state === 'bad' && <p className="warn">{a.t('aiBad')}</p>}
    </section>
  );
}

/** "You" tab: account, language, taste profile and the optional AI key. */
export default function Profile() {
  const a = useA();
  const [p, setP] = useState<Pr>(a.profile);
  const [done, setDone] = useState(false);
  return (
    <div className="page profile">
      <section className="card">
        {a.user ? (
          <div className="row between wrap"><p>{a.t('signedInAs', { name: a.user.name })}</p><button className="btn ghost" onClick={() => { a.setUser(null); a.setEntered(false); history.replaceState(null, '', location.pathname + '#/'); }}>{a.t('signOut')}</button></div>
        ) : (
          <div className="row between wrap"><p>{a.t('signInToSave')}</p><button className="btn primary" onClick={() => { a.setEntered(false); history.replaceState(null, '', location.pathname + '#/'); }}>{a.t('w_google')}</button></div>
        )}
        <fieldset><legend>{a.t('language')}</legend>
          <div className="chips-row">{(['en', 'hi'] as const).map((l) => (
            <button key={l} type="button" className={`pill${a.lang === l ? ' on' : ''}`} aria-pressed={a.lang === l} onClick={() => a.setLang(l)}>{l === 'en' ? 'English' : 'हिन्दी'}</button>
          ))}</div>
        </fieldset>
        <p className="muted small">{a.t('privacy')}</p>
      </section>

      <section className="card">
        <h2>{a.t('tasteTitle')}</h2>
        <TasteForm value={p} onChange={(x) => { setP(x); setDone(false); }} />
        <button className="btn primary" onClick={() => { a.setProfile({ ...p, lang: a.lang }); setDone(true); }}>{a.t('saveProfile')}</button>
        {done && <p className="notice">{a.t('profileSaved')}</p>}
      </section>

      <AiKey />
    </div>
  );
}
