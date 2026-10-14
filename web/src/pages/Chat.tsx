import { useEffect, useRef, useState } from 'react';
import { bestVerdict, checkUnit, type Plan } from '../core';
import { respondAI, respondLocal, suggestions, type BotMsg, type Card, type Msg } from '../chat/engine';
import type { Ctx } from '../chat/tools';
import { useA } from '../store';
import { Reasons, VerdictBadge } from '../ui/bits';
import PlanView from '../ui/PlanView';
import { FeeTable } from './Place';

function ChatPlan({ plan }: { plan: Plan }) {
  const a = useA();
  const [p, setP] = useState(plan);
  return (
    <div className="chat-card">
      <PlanView plan={p} compact onChange={(x) => { setP(x); a.setLastPlan(x); }} />
    </div>
  );
}

function PlaceCard({ id, date }: { id: string; date: string }) {
  const a = useA();
  const place = a.data.places.find((p) => p.id === id);
  if (!place) return null;
  const d = date || a.today;
  const res = place.units.map((u) => ({ u, r: checkUnit(a.data, u, d, { pace: a.profile.pace }) }));
  const fees = place.units.find((u) => u.fees.v)?.fees;
  return (
    <div className="chat-card card place-mini">
      <div className="row between wrap"><h3>{a.l(place.name)}</h3><VerdictBadge v={bestVerdict(res.map((x) => x.r.verdict))} small /></div>
      <p className="muted small">{a.dateDow(d)} · {a.l(place.type)}</p>
      <ul className="verdicts">
        {res.map(({ u, r }) => (
          <li key={u.id}>
            <div className="verdict-line">{place.units.length > 1 && <strong>{a.l(u.name)}</strong>}<VerdictBadge v={r.verdict} small /></div>
            <Reasons reasons={r.reasons} />
          </li>
        ))}
      </ul>
      {fees?.v && <><p className="small"><strong>{a.t('b_fees')}</strong></p><FeeTable fees={fees.v} /></>}
      <a className="btn small" href={`#/place/${id}`}>{a.t('c_viewAll')} →</a>
    </div>
  );
}

function CardView({ c }: { c: Card }) {
  const a = useA();
  if (c.kind === 'plan') return <ChatPlan plan={c.plan} />;
  if (c.kind === 'place') return <PlaceCard id={c.placeId} date={c.date} />;
  if (c.kind === 'notCovered') return <div className="chat-card card not-covered"><strong>{a.t('notCovered')}</strong><p className="small">{a.t('notCoveredBody')}</p></div>;
  if (c.kind === 'emergency') return <a className="chat-card emergency big" href="tel:112">📞 112</a>;
  return (
    <ul className="chat-card mini-list">
      {c.ids.map((id) => { const p = a.data.places.find((x) => x.id === id)!; return (
        <li key={id}><a href={`#/place/${id}`}><strong>{a.l(p.name)}</strong><span className="muted small">{a.l(p.type)}</span></a></li>
      ); })}
    </ul>
  );
}

/** Home: talk to Dishaara. Plans, checks and prices appear as cards under each reply. */
export default function Chat() {
  const a = useA();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const ctx = (): Ctx => ({ data: a.data, today: a.today, profile: a.profile, counts: a.counts, tr: a, lastPlan: a.lastPlan });
  const greeting: BotMsg = { role: 'bot', text: `${a.t('c_hello', { name: a.user ? ', ' + a.user.name : '' })}\n\n${a.t('c_intro')}`, cards: [], chips: suggestions(ctx()) };
  const msgs: Msg[] = [greeting, ...a.chat];

  // Show the newest reply from its top, so a long plan is read from the start.
  useEffect(() => {
    const turns = document.querySelectorAll('.thread > li');
    const target = busy ? end.current : turns[turns.length - 1];
    if (a.chat.length) target?.scrollIntoView({ behavior: 'smooth', block: busy ? 'end' : 'start' });
  }, [a.chat.length, busy]);

  const send = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    setText('');
    const history = a.chat;
    a.setChat([...history, { role: 'user', text: q }]);
    setBusy(true);
    const c = ctx();
    let out;
    if (a.groqKey) {
      try { out = await respondAI(q, history, c, a.slots, a.groqKey); }
      catch { out = respondLocal(q, c, a.slots); out.msg.note = 'down'; }
    } else out = respondLocal(q, c, a.slots);
    a.setSlots(out.slots);
    a.setLastPlan(c.lastPlan);
    a.setChat([...history, { role: 'user', text: q }, out.msg]);
    setBusy(false);
  };

  // ?ask=... sends that question on open, so a shared link shows an answer straight away.
  useEffect(() => { const q = new URLSearchParams(location.search).get('ask'); if (q && !a.chat.length) send(q); }, []); // eslint-disable-line

  const last = msgs[msgs.length - 1];
  return (
    <div className="page chat">
      <div className={`ai-status${a.groqKey ? ' on' : ''}`}>
        <span aria-hidden>{a.groqKey ? '✦' : '◇'}</span> {a.groqKey ? a.t('c_aiOn') : <>{a.t('c_aiOff')} <a href="#/you">{a.t('navYou')}</a></>}
      </div>
      <ol className="thread" aria-live="polite">
        {msgs.map((m, i) => m.role === 'user' ? (
          <li key={i} className="bubble user">{m.text}</li>
        ) : (
          <li key={i} className="bot-turn">
            <div className="bubble bot">
              {m.ai && <span className="ai-tag">{a.t('c_generated')}</span>}
              {m.note === 'down' && <span className="ai-tag warn">{a.t('c_aiDown')}</span>}
              {m.text.split('\n\n').map((para, j) => <p key={j}>{para}</p>)}
            </div>
            {m.cards.map((c, j) => <CardView key={j} c={c} />)}
          </li>
        ))}
        {busy && <li className="bubble bot typing"><span /><span /><span /> <span className="sr">{a.t('c_thinking')}</span></li>}
      </ol>
      {!busy && last.role === 'bot' && !!last.chips.length && (
        <div className="quick" role="group">
          {last.chips.map((c) => <button key={c.label} className="pill" onClick={() => send(c.send)}>{c.label}</button>)}
        </div>
      )}
      <div ref={end} />
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={a.t('c_placeholder')} aria-label={a.t('c_placeholder')} enterKeyHint="send" />
        <button className="btn primary" disabled={!text.trim() || busy} aria-label={a.t('c_send')}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path fill="currentColor" d="M3 20.5 21 12 3 3.5V10l12 2-12 2v6.5Z" /></svg>
        </button>
      </form>
    </div>
  );
}
