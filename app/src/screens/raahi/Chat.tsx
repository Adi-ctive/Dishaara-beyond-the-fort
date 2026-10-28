import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { getKey, respondAI } from '../../chat/ai';
import { api, apiOn } from '../../api';
import { feeFor, fmt, people, startCoord, startName } from '../../core';
import { respond, starterChips, type Card, type Reply } from '../../chat/local';
import { useNav } from '../../nav';
import { useStore } from '../../store';
import { t } from '../../i18n';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../ui/Icon';
import { Md, plain } from '../../ui/Md';
import { PlaceCard } from '../../ui/PlaceCard';
import { canListen, listen, speak, warmVoice } from '../../voice';

type Msg = { id: number; role: 'user' | 'bot'; text: string; cards: Card[]; chips: string[]; at?: number; ai?: boolean; note?: 'grounding' | 'error'; status?: 'failed' | 'working' | 'done' };
type Saved = { id: string; title: string; updated: string; count: number };

// The open chat stays on the phone, so a refresh does not wipe it. Signed-in raahis also keep it on their account.
const CUR = 'dishaara.chat.current';
const LIST = 'dishaara.chats';
const read = <T,>(k: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '') as T;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked: the chat lasts this page only */
  }
};
const newId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const clock = (t?: number) => (t ? new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');
// Limits: Yatra reads the last 6 messages in full and a short summary of the rest. A chat past LONG messages
// still works, the raahi is just told a new chat keeps answers sharper. Phones keep 20 chats of up to 120 messages.
const LONG = 40;
const KEEP_CHATS = 20;
const KEEP_MSGS = 120;
/** Older messages of this chat as one short line Yatra gets as context: what was asked, which places came up. */
const summarise = (m: Msg[], data: { places: { id: string; name: { en: string } }[] }) => {
  const old = m.slice(0, -6);
  if (!old.length) return '';
  const asked = old.filter((x) => x.role === 'user').map((x) => x.text.slice(0, 60));
  const places = [...new Set(old.flatMap((x) => x.cards.flatMap((c) => (c.kind === 'place' ? [c.id] : c.kind === 'places' ? c.ids : []))))]
    .map((id) => data.places.find((p) => p.id === id)?.name.en)
    .filter(Boolean);
  return `Asked earlier: ${asked.slice(-8).join('; ')}.${places.length ? ` Places shown: ${places.slice(0, 8).join(', ')}.` : ''}`.slice(0, 880);
};
const titleOf = (m: Msg[]) => (m.find((x) => x.role === 'user')?.text ?? 'Chat').slice(0, 60);

// One small dot per sent message: red = not received, yellow = received and being answered, green = answered.
const STATUS = {
  failed: { en: 'Not received', hi: 'नहीं पहुँचा' },
  working: { en: 'Received, answering', hi: 'मिला, जवाब बन रहा' },
  done: { en: 'Answered', hi: 'जवाब दिया' },
} as const;
function StatusDot({ st, lang }: { st: NonNullable<Msg['status']>; lang: 'en' | 'hi' }) {
  const [show, setShow] = useState(false);
  return (
    <button type="button" className={`msg-dot ${st}`} title={STATUS[st][lang]} aria-label={STATUS[st][lang]} onClick={() => setShow((x) => !x)} onBlur={() => setShow(false)}>
      {show && <span className="msg-dot-tip">{STATUS[st][lang]}</span>}
    </button>
  );
}

/** Places the last bot reply showed: a follow-up like "where is this listed?" is about them. */
const lastPlaceIds = (msgs: Msg[]) => {
  const m = [...msgs].reverse().find((x) => x.role === 'bot' && x.cards.some((c) => c.kind === 'place' || c.kind === 'places'));
  return (m?.cards ?? []).flatMap((c) => (c.kind === 'place' ? [c.id] : c.kind === 'places' ? c.ids : [])).slice(0, 3);
};

function Cards({ cards }: { cards: Card[] }) {
  const { data } = useStore();
  const { open, go } = useNav();
  const { lang } = useTheme();
  const hi = lang === 'hi';
  return (
    <div className="msg-cards">
      {cards.map((c, i) => {
        if (c.kind === 'place') return <PlaceCard key={i} place={data.places.find((p) => p.id === c.id)!} />;
        if (c.kind === 'places') return c.ids.slice(0, 3).map((id, j) => <PlaceCard key={id} i={j} place={data.places.find((p) => p.id === id)!} />);
        if (c.kind === 'quick')
          return (
            <button key={i} className="card quick" onClick={() => open({ kind: 'quick', hours: c.hours })}>
              <span className="quick-icon"><Icon name="sparkle" size={22} /></span>
              <span><b>{t('quick', lang)}</b><small>{t('quickSub', lang)}</small></span>
            </button>
          );
        if (c.kind === 'roadmap')
          return (
            <button key={i} className="card row" onClick={() => go('roadmap')}>
              <Icon name="route" size={22} /> <span className="grow"><b>{hi ? 'रोडमैप खोलें' : 'Open the roadmap'}</b></span> <Icon name="arrow" size={16} />
            </button>
          );
        if (c.kind === 'bazaar')
          return (
            <button key={i} className="card row" onClick={() => go('bazaar')}>
              <Icon name="store" size={22} /> <span className="grow"><b>{hi ? 'बाज़ार खोलें' : 'Open the Bazaar'}</b></span> <Icon name="arrow" size={16} />
            </button>
          );
        if (c.kind === 'sos')
          return (
            <a key={i} className="sos-row primary" href="tel:112">
              <Icon name="phone" size={22} /> <span><b>{t('call112', lang)}</b></span>
            </a>
          );
        return null;
      })}
    </div>
  );
}

export function ChatTab() {
  const { data, today, s, plan } = useStore();
  const { lang } = useTheme();
  const { open, go } = useNav();
  const hi = lang === 'hi';
  const [cur, setCur] = useState<{ id: string; msgs: Msg[] }>(() => read(CUR, { id: newId(), msgs: [] as Msg[] }));
  const msgs = cur.msgs;
  const setMsgs = (f: (m: Msg[]) => Msg[]) => setCur((c) => ({ ...c, msgs: f(c.msgs) }));
  const [past, setPast] = useState<Saved[] | null>(null);
  // Keep the open chat on the phone, and on the account when signed in (a short pause so typing is not sent each time).
  useEffect(() => {
    write(CUR, cur);
    if (!cur.msgs.length) return;
    const row = { id: cur.id, title: titleOf(cur.msgs), updated: new Date().toISOString(), count: cur.msgs.length };
    const list = [row, ...read<Saved[]>(LIST, []).filter((x) => x.id !== cur.id)];
    // Oldest chats beyond the limit are dropped from the phone.
    for (const gone of list.slice(KEEP_CHATS)) {
      try {
        localStorage.removeItem(`dishaara.chat.${gone.id}`);
      } catch {
        /* storage blocked */
      }
    }
    write(LIST, list.slice(0, KEEP_CHATS));
    write(`dishaara.chat.${cur.id}`, cur.msgs.slice(-KEEP_MSGS));
    if (!apiOn() || !s.signedIn) return;
    const t = setTimeout(() => api.chatSave(cur.id, { title: row.title, city: s.city, msgs: cur.msgs.filter((m) => m.status !== 'working').slice(-KEEP_MSGS) }), 1200);
    return () => clearTimeout(t);
  }, [cur, s.signedIn]);
  const showPast = async () => {
    if (past) return setPast(null);
    const remote = apiOn() && s.signedIn ? await api.chats() : null;
    const local = read<Saved[]>(LIST, []);
    const all = [...(remote ?? []), ...local.filter((l) => !remote?.some((r) => r.id === l.id))].sort((a, b) => b.updated.localeCompare(a.updated));
    setPast(all);
  };
  const openChat = async (id: string) => {
    const local = read<Msg[] | null>(`dishaara.chat.${id}`, null);
    const remote = !local && apiOn() && s.signedIn ? await api.chatGet(id) : null;
    const m = (local ?? (remote?.msgs as Msg[] | undefined) ?? []).map((x) => ({ ...x, status: x.status === 'working' ? 'failed' as const : x.status }));
    setCur({ id, msgs: m });
    setPast(null);
  };
  const newChat = () => {
    setCur({ id: newId(), msgs: [] });
    setPast(null);
  };
  const [saying, setSaying] = useState<{ id: number; st: 'loading' | 'playing' } | null>(null);
  useEffect(() => warmVoice(), []);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  const endRef = useRef<HTMLDivElement>(null);

  // Braces matter: newer browsers return a promise from scrollIntoView, and an effect may only return a cleanup.
  useEffect(() => {
    if (msgs.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs]);

  const [thinking, setThinking] = useState(false);

  // With a key the model writes the words on top of our facts; without one, the rule-based answer.
  const send = async (q: string) => {
    const query = q.trim();
    if (!query || thinking) return;
    const n = Date.now();
    const mark = (st: Msg['status']) => setMsgs((m) => m.map((x) => (x.id === n ? { ...x, status: st } : x)));
    setMsgs((m) => [...m, { id: n, role: 'user', text: query, cards: [], chips: [], at: n, status: apiOn() && !navigator.onLine ? 'failed' : 'working' }]);
    setText('');
    const key = getKey();
    let r: Reply & { ai?: boolean; note?: Msg['note'] };
    const last = lastPlaceIds(msgs);
    const local = respond(query, data, today, lang, last, plan, s.prefs.payment, s.twists);
    if (apiOn()) {
      // The backend holds the key and picks the places; the cards follow the places it answered about.
      setThinking(true);
      const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
      const earlier = summarise(msgs, data);
      // The roadmap with every time and rupee, so Yatra can lay out the day as a table.
      const rs = (r: { min: number; max: number } | null | undefined) => (!r ? 'not known' : r.max === 0 ? 'free' : r.min === r.max ? `₹${r.min}` : `₹${r.min}–${r.max}`);
      const ride = (l: NonNullable<typeof plan>['stops'][number]['leg']) => `${l.mode} ${l.minutes + l.buffer} min`;
      const roadmap = plan
        ? {
            stops: plan.stops.map((x) => ({ name: x.unit.name[lang], rideThere: ride(x.leg), rideFare: rs(x.leg.fare), arrive: fmt(x.arrive), leave: fmt(x.depart), ticketEach: rs(feeFor(x.unit.fees.v, 'indian', s.prefs.payment)), verdict: x.check.verdict })),
            rideBack: plan.returnLeg ? { ride: ride(plan.returnLeg), fare: rs(plan.returnLeg.fare) } : null,
            backBy: fmt(plan.finish),
            totals: { tickets: rs(plan.budget.fees), rides: rs(plan.budget.fares), total: rs(plan.budget.total), people: people(s.prefs.group) },
          }
        : undefined;
      const from = s.quick?.startPoint ?? data.landmarks[0]?.id;
      const origin = from ? { name: startName(data, from)[lang], lat: startCoord(data, from)[0], lng: startCoord(data, from)[1] } : undefined;
      const res = await api.chat({ text: query, history, lang, prompt: s.prompt, roadmap, city: s.city, origin, lastPlaces: last, earlier, chatId: cur.id });
      mark(res ? 'done' : 'failed');
      const ids = (res?.placeIds ?? []).filter((id) => data.places.some((p) => p.id === id));
      const keep = local.cards.filter((c) => c.kind !== 'place' && c.kind !== 'places');
      const cards: Card[] = res ? (ids.length ? [...keep, { kind: 'places', ids: ids.slice(0, 3) }] : keep) : local.cards;
      const chips = res?.followUps?.length ? res.followUps : local.chips;
      if (res?.ai && res.text) r = { ...local, text: res.text, ai: true, cards, chips };
      else if (res && res.note !== 'no-key') r = { ...local, cards, chips, note: res.note === 'grounding' ? 'grounding' : undefined };
      // The server has no key but this browser does: ask the model from here instead.
      else if ((!res || res.note === 'no-key') && key) r = await respondAI(query, history, { data, today, lang, plan, added: s.added, prompt: s.prompt }, key);
      else r = { ...local, note: res ? undefined : 'error' };
      setThinking(false);
    } else if (key) {
      setThinking(true);
      const history = msgs.map((m) => ({ role: m.role, text: m.text }));
      r = await respondAI(query, history, { data, today, lang, plan, added: s.added, prompt: s.prompt }, key);
      setThinking(false);
      mark('done');
    } else {
      r = local;
      mark('done');
    }
    setMsgs((m) => [...m, { id: n + 1, role: 'bot', at: Date.now(), ...r }]);
    if (s.prefs.autoVoice) speak(plain(r.text), lang);
  };

  const mic = () => {
    if (listening) {
      stopRef.current();
      return;
    }
    setListening(true);
    stopRef.current = listen(lang, (q) => send(q), () => setListening(false));
  };

  const starters = starterChips(hi, data);

  return (
    <div className="screen chat">
      {msgs.length > 0 && <h1 className="sr-only">{hi ? 'यात्रा से चैट' : 'Chat with Yatra'}</h1>}
      <div className="chat-bar">
        <button type="button" className="chip" onClick={showPast}><Icon name="clock" size={14} /> {hi ? 'पिछली चैट' : 'Past chats'}</button>
        {msgs.length > 0 && <button type="button" className="chip" onClick={newChat}><Icon name="sparkle" size={14} /> {hi ? 'नई चैट' : 'New chat'}</button>}
      </div>
      {past && (
        <div className="card past-chats">
          {past.length === 0 && <small>{hi ? 'अभी कोई पुरानी चैट नहीं।' : 'No earlier chats yet.'}</small>}
          {past.map((c) => (
            <button key={c.id} type="button" className={`row past-row${c.id === cur.id ? ' on' : ''}`} onClick={() => openChat(c.id)}>
              <span className="grow"><b>{c.title}</b><small>{new Date(c.updated).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {c.count} {hi ? 'संदेश' : 'messages'}</small></span>
              <Icon name="arrow" size={14} />
            </button>
          ))}
          <small className="muted">{hi ? `सबसे नई ${KEEP_CHATS} चैट रखी जाती हैं, हर एक में आख़िरी ${KEEP_MSGS} संदेश।` : `The newest ${KEEP_CHATS} chats are kept, each with its last ${KEEP_MSGS} messages.`}</small>
          {!s.signedIn && <small className="muted">{hi ? 'ये चैट सिर्फ़ इस फ़ोन पर हैं। साइन इन करें तो खाते में भी रहेंगी।' : 'These chats are on this phone only. Sign in to keep them on your account.'}</small>}
        </div>
      )}
      {msgs.length === 0 && (
        <>
          <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {t('hello', lang)}
          </motion.p>
          <motion.h1 className="display" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            {t('where', lang)}
          </motion.h1>
          {!s.onboarded && (
            <button className="card row soft" onClick={() => open({ kind: 'onboarding' })}>
              <Icon name="sparkle" size={22} />
              <span className="grow"><b>{hi ? 'अपनी पसंद बताएँ' : 'Tell us what you enjoy'}</b><small>{hi ? '30 सेकंड, छोड़ भी सकते हैं' : '30 seconds, or skip it'}</small></span>
              <Icon name="arrow" size={16} />
            </button>
          )}
          <motion.button className="card quick" onClick={() => open({ kind: 'quick' })} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <span className="quick-icon"><Icon name="sparkle" size={22} /></span>
            <span><b>{t('quick', lang)}</b><small>{t('quickSub', lang)}</small></span>
            <Icon name="arrow" size={18} />
          </motion.button>
          {plan && (
            <button className="card row" onClick={() => go('roadmap')}>
              <Icon name="route" size={22} />
              <span className="grow"><b>{hi ? 'आज का रोडमैप' : "Today's roadmap"}</b><small>{plan.stops.length} {hi ? 'जगहें' : 'stops'}</small></span>
              <Icon name="arrow" size={16} />
            </button>
          )}
          <button className="card row feed-teaser" onClick={() => open({ kind: 'feed' })}>
            <Icon name="users" size={22} />
            <span className="grow"><b>{hi ? 'सारथियों और बाज़ार से' : 'From saarthis and the Bazaar'}</b><small>{hi ? 'जाँच, फ़ोटो, वीडियो, ऑफ़र' : 'Checks, photos, videos, offers'}</small></span>
            <Icon name="arrow" size={16} />
          </button>
          <button className="card row" onClick={() => open({ kind: 'alerts' })}>
            <Icon name="bell" size={22} />
            <span className="grow"><b>{hi ? 'आज की सूचनाएँ' : "Today's alerts"}</b><small>{hi ? 'भीड़, ख़बरें, मौसम' : 'Crowds, news, weather'}</small></span>
            <Icon name="arrow" size={16} />
          </button>
        </>
      )}

      <div className="thread" aria-live="polite">
        <AnimatePresence initial={false}>
          {msgs.map((m) => (
            <motion.div key={m.id} className={`msg ${m.role}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              {m.role === 'bot' ? (
                <>
                  <div className="bubble bot">
                    <span className="bot-name">{hi ? 'यात्रा' : 'Yatra'}</span>
                    <Md text={m.text} animate={Date.now() - (m.at ?? 0) < 5000} />
                    {m.ai && <span className="ai-tag">{hi ? 'AI · हमारे डेटा से जाँचा' : 'AI · checked against our data'}</span>}
                    {m.note && <span className="ai-tag warn">{m.note === 'grounding' ? (hi ? 'AI का जवाब जाँच में फ़ेल, सीधा जवाब दिखाया' : 'AI reply failed the fact check, plain answer shown') : hi ? 'AI से जुड़ नहीं सका, सीधा जवाब दिखाया' : 'Could not reach the AI, plain answer shown'}</span>}
                    <button className={`say${saying?.id === m.id ? ` ${saying.st}` : ''}`} onClick={() => speak(plain(m.text), lang, (st) => setSaying(st === 'idle' ? null : { id: m.id, st }))} aria-label={hi ? 'सुनें' : 'Read aloud'}>
                      <Icon name="speaker" size={16} />
                    </button>
                  </div>
                  {m.at && <span className="msg-meta">{clock(m.at)}</span>}
                  <Cards cards={m.cards} />
                  {m.chips.length > 0 && (
                    <div className="chips">
                      {m.chips.map((c) => (
                        <button key={c} className="chip" onClick={() => send(c)}>{c}</button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="bubble user">{m.text}</div>
                  <span className="msg-meta">{clock(m.at ?? m.id)}{m.status && <StatusDot st={m.status} lang={lang} />}</span>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {thinking && (
          <div className="msg bot">
            <div className="bubble bot typing" aria-label={hi ? 'यात्रा सोच रही है' : 'Yatra is thinking'}>
              <i /><i /><i />
            </div>
          </div>
        )}
        {msgs.length >= LONG && (
          <p className="chat-limit small muted">
            {hi
              ? `यह चैट लंबी हो गई है (${msgs.length} संदेश)। यात्रा पुराने हिस्से का सिर्फ़ सार पढ़ती है। नए विषय के लिए नई चैट बेहतर है। यहाँ जारी भी रख सकते हैं।`
              : `This chat is long (${msgs.length} messages). Yatra now reads only a summary of the older part. A new chat is better for a new topic, or carry on here.`}
            {' '}<button type="button" className="link" onClick={newChat}>{hi ? 'नई चैट' : 'New chat'}</button>
          </p>
        )}
        <div ref={endRef} />
      </div>

      {msgs.length === 0 && (
        <div className="chips">
          {starters.map((c) => (
            <button key={c} className="chip" onClick={() => send(c)}>{c}</button>
          ))}
        </div>
      )}

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('askAnything', lang)} aria-label={t('askAnything', lang)} />
        {text ? (
          <button className="mic" type="submit" aria-label={hi ? 'भेजें' : 'Send'}><Icon name="arrow" size={22} /></button>
        ) : (
          <button className={`mic${listening ? ' live' : ''}`} type="button" onClick={mic} aria-label={hi ? 'बोलें' : 'Speak'} title={canListen() ? '' : 'Voice input needs Chrome or Edge'}>
            <Icon name="mic" size={22} />
          </button>
        )}
      </form>
    </div>
  );
}
