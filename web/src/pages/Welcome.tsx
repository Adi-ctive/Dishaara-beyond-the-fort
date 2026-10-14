import { useState } from 'react';
import { DEFAULT_PROFILE, type Profile } from '../core';
import { useA } from '../store';
import { TasteForm } from './Profile';

function LangToggle() {
  const a = useA();
  return (
    <div className="lang" role="group" aria-label="Language">
      <button className={a.lang === 'en' ? 'on' : ''} aria-pressed={a.lang === 'en'} onClick={() => a.setLang('en')}>EN</button>
      <button className={a.lang === 'hi' ? 'on' : ''} aria-pressed={a.lang === 'hi'} onClick={() => a.setLang('hi')} lang="hi">हि</button>
    </div>
  );
}

const Logo = () => (
  <svg viewBox="0 0 32 32" width="56" height="56" aria-hidden><path d="M16 2 4 9v2h24V9L16 2Z" fill="var(--terracotta)" /><path d="M7 13h3v11H7zm7.5 0h3v11h-3zM22 13h3v11h-3zM4 26h24v3H4z" fill="#fff" /><circle cx="16" cy="7.5" r="1.6" fill="var(--sand)" /></svg>
);

/** First screen: mock Google sign-in or guest (FR-VO-01, E15). */
export function Welcome() {
  const a = useA();
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState('');
  const enter = (user: { name: string } | null) => { a.setUser(user); a.setEntered(true); location.hash = '#/'; };
  return (
    <div className="welcome">
      <div className="welcome-top"><LangToggle /></div>
      <div className="welcome-body">
        <Logo />
        <p className="welcome-brand">Dishaara <span>दिशारा</span></p>
        <h1>{a.t('w_title')}</h1>
        <p className="welcome-sub">{a.t('w_sub')}</p>
        <ul className="benefits">
          <li><span aria-hidden>💬</span>{a.t('w_b1')}</li>
          <li><span aria-hidden>✓</span>{a.t('w_b2')}</li>
          <li><span aria-hidden>₹</span>{a.t('w_b3')}</li>
        </ul>
        {asking ? (
          <form className="welcome-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) enter({ name: name.trim() }); }}>
            <label>{a.t('w_name')}<input autoFocus value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
            <button className="btn google-btn" disabled={!name.trim()}>{a.t('w_continue')}</button>
          </form>
        ) : (
          <button className="btn google-btn" onClick={() => setAsking(true)}><span className="g" aria-hidden>G</span>{a.t('w_google')}</button>
        )}
        <button className="btn ghost-light" onClick={() => enter(null)}>{a.t('w_guest')}</button>
        <p className="welcome-note">{a.t('w_mock')}</p>
      </div>
    </div>
  );
}

/** Two quick questions for personalisation; can be skipped. */
export function Setup() {
  const a = useA();
  const [step, setStep] = useState(1);
  const [p, setP] = useState<Profile>({ ...DEFAULT_PROFILE, ...a.profile });
  const finish = (save: boolean) => { if (save) a.setProfile({ ...p, lang: a.lang }); a.setSetupDone(true); location.hash = '#/'; };
  return (
    <div className="page setup">
      <div className="row between"><span className="muted small">{step} / 2</span><button className="btn ghost small" onClick={() => finish(false)}>{a.t('s_skip')}</button></div>
      <h1>{step === 1 ? a.t('s_title') : a.t('s_how')}</h1>
      <p className="muted">{a.t('s_sub')}</p>
      <section className="card">
        <TasteForm part={step === 1 ? 'likes' : 'style'} value={p} onChange={setP} />
      </section>
      {step === 1
        ? <button className="btn primary wide" onClick={() => setStep(2)}>{a.t('s_next')}</button>
        : <button className="btn primary wide" onClick={() => finish(true)}>{a.t('s_done')}</button>}
    </div>
  );
}
