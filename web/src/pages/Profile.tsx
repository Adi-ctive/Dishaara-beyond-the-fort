import { useState } from 'react';
import type { Budget, Lang, Pace, Profile as Pr, Walking } from '../core';
import { useA } from '../store';
import { TAGS } from './Home';

// Taste profile at first sign-in (FR-VO-03). Sign-in is mocked: nothing leaves the browser.
export default function Profile() {
  const a = useA();
  const [name, setName] = useState(a.user?.name ?? '');
  const [p, setP] = useState<Pr>(a.profile);
  const [done, setDone] = useState(false);

  const cycle = (t: string) => {
    const like = p.likes.includes(t), dis = p.dislikes.includes(t);
    if (!like && !dis) setP({ ...p, likes: [...p.likes, t] });
    else if (like) setP({ ...p, likes: p.likes.filter((x) => x !== t), dislikes: [...p.dislikes, t] });
    else setP({ ...p, dislikes: p.dislikes.filter((x) => x !== t) });
  };
  const opt = <K extends 'pace' | 'walking' | 'budget' | 'lang'>(k: K, vals: Pr[K][], key: (v: Pr[K]) => string) => (
    <fieldset><legend>{a.t(k === 'lang' ? 'language' : k)}</legend>
      <div className="chips-row">{vals.map((v) => (
        <button key={v} type="button" className={`pill${p[k] === v ? ' on' : ''}`} aria-pressed={p[k] === v} onClick={() => setP({ ...p, [k]: v })}>{key(v)}</button>
      ))}</div>
    </fieldset>
  );

  return (
    <div className="page profile">
      <section className="card">
        {a.user ? (
          <div className="row between wrap"><p>{a.t('signedInAs', { name: a.user.name })}</p><button className="btn ghost" onClick={() => a.setUser(null)}>{a.t('signOut')}</button></div>
        ) : (
          <form className="signin" onSubmit={(e) => { e.preventDefault(); if (name.trim()) a.setUser({ name: name.trim() }); }}>
            <label>{a.t('yourName')}<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
            <div className="row wrap">
              <button className="btn primary google" disabled={!name.trim()}><span className="g" aria-hidden>G</span>{a.t('signIn')}</button>
              <a className="btn ghost" href="#/">{a.t('guest')}</a>
            </div>
          </form>
        )}
        <p className="muted small">{a.t('privacy')}</p>
      </section>

      <section className="card">
        <h1>{a.t('tasteTitle')}</h1>
        <p className="muted small">{a.t('tasteHint')}</p>
        <div className="chips-row">
          {TAGS.map((t) => {
            const st = p.likes.includes(t) ? 'like' : p.dislikes.includes(t) ? 'dislike' : '';
            return <button key={t} type="button" className={`pill ${st}`} onClick={() => cycle(t)}>{st === 'like' ? '♥ ' : st === 'dislike' ? '✕ ' : ''}{a.t(`tag_${t}`)}{st && <span className="sr"> ({a.t(st)})</span>}</button>;
          })}
        </div>
        {opt('pace', ['relaxed', 'normal', 'fast'] as Pace[], (v) => a.t(`p_${v}`))}
        {opt('walking', ['low', 'medium', 'high'] as Walking[], (v) => a.t(`w_${v}`))}
        {opt('budget', ['low', 'medium', 'high'] as Budget[], (v) => a.t(`bu_${v}`))}
        {opt('lang', ['en', 'hi'] as Lang[], (v) => (v === 'en' ? 'English' : 'हिन्दी'))}
        <button className="btn primary" onClick={() => { a.setProfile(p); a.setLang(p.lang); setDone(true); }}>{a.t('saveProfile')}</button>
        {done && <p className="notice">{a.t('profileSaved')} <a href="#/plan">{a.t('navPlan')} →</a></p>}
      </section>
    </div>
  );
}
