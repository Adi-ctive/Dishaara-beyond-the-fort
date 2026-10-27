import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { getKey, respondAI } from '../../chat/ai';
import { api, apiOn } from '../../api';
import { fmt, startCoord, startName } from '../../core';
import { respond, starterChips, type Card, type Reply } from '../../chat/local';
import { useNav } from '../../nav';
import { useStore } from '../../store';
import { t } from '../../i18n';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../ui/Icon';
import { PlaceCard } from '../../ui/PlaceCard';
import { canListen, listen, speak, warmVoice } from '../../voice';

type Msg = { id: number; role: 'user' | 'bot'; text: string; cards: Card[]; chips: string[]; ai?: boolean; note?: 'grounding' | 'error'; status?: 'failed' | 'working' | 'done' };

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

// Bot text arrives word by word, the way the voice reads it.
function Words({ text }: { text: string }) {
  return (
    <span>
      {text.split(' ').map((w, i) => (
        <motion.span key={i} className="word" initial={{ opacity: 0, y: '0.5em' }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}>
          {w}{' '}
        </motion.span>
      ))}
    </span>
  );
}

function Cards({ cards }: { cards: Card[] }) {
  const { data } = useStore();
  const { open, go } = useNav();
  const { lang } = useTheme();
  const hi = lang === 'hi';
  return (
    <div className="msg-cards">
      {cards.map((c, i) => {
        if (c.kind === 'place') return <PlaceCard key={i} place={data.places.find((p) => p.id === c.id)!} />;
        if (c.kind === 'places') return c.ids.map((id, j) => <PlaceCard key={id} i={j} place={data.places.find((p) => p.id === id)!} />);
        if (c.kind === 'quick')
          return (
            <button key={i} className="card quick" onClick={() => open({ kind: 'quick', hours: c.hours })}>
              <span className="quick-icon"><Icon name="sparkle" size={22} /></span>
              <span><b>{t('quick', lang)}</b><small>{t('quickSub', lang)}</small></span>
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
  const [msgs, setMsgs] = useState<Msg[]>([]);
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
    setMsgs((m) => [...m, { id: n, role: 'user', text: query, cards: [], chips: [], status: apiOn() && !navigator.onLine ? 'failed' : 'working' }]);
    setText('');
    const key = getKey();
    let r: Reply & { ai?: boolean; note?: Msg['note'] };
    const last = lastPlaceIds(msgs);
    const local = respond(query, data, today, lang, last);
    if (apiOn()) {
      // The backend holds the key and picks the places; the cards follow the places it answered about.
      setThinking(true);
      const history = msgs.map((m) => ({ role: m.role, text: m.text }));
      const roadmap = plan ? { stops: plan.stops.map((x) => ({ name: x.unit.name[lang], arrive: fmt(x.arrive), leave: fmt(x.depart), verdict: x.check.verdict })), backBy: fmt(plan.finish) } : undefined;
      const from = s.quick?.startPoint ?? data.landmarks[0]?.id;
      const origin = from ? { name: startName(data, from)[lang], lat: startCoord(data, from)[0], lng: startCoord(data, from)[1] } : undefined;
      const res = await api.chat({ text: query, history, lang, prompt: s.prompt, roadmap, city: s.city, origin, lastPlaces: last });
      mark(res ? 'done' : 'failed');
      const ids = (res?.placeIds ?? []).filter((id) => data.places.some((p) => p.id === id));
      const keep = local.cards.filter((c) => c.kind !== 'place' && c.kind !== 'places');
      const cards: Card[] = ids.length ? [...keep, { kind: 'places', ids }] : local.cards;
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
    setMsgs((m) => [...m, { id: n + 1, role: 'bot', ...r }]);
    if (s.prefs.autoVoice) speak(r.text, lang);
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
                    <Words text={m.text} />
                    {m.ai && <span className="ai-tag">{hi ? 'AI · हमारे डेटा से जाँचा' : 'AI · checked against our data'}</span>}
                    {m.note && <span className="ai-tag warn">{m.note === 'grounding' ? (hi ? 'AI का जवाब जाँच में फ़ेल, सीधा जवाब दिखाया' : 'AI reply failed the fact check, plain answer shown') : hi ? 'AI से जुड़ नहीं सका, सीधा जवाब दिखाया' : 'Could not reach the AI, plain answer shown'}</span>}
                    <button className={`say${saying?.id === m.id ? ` ${saying.st}` : ''}`} onClick={() => speak(m.text, lang, (st) => setSaying(st === 'idle' ? null : { id: m.id, st }))} aria-label={hi ? 'सुनें' : 'Read aloud'}>
                      <Icon name="speaker" size={16} />
                    </button>
                  </div>
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
                <div className="bubble user">{m.text}{m.status && <StatusDot st={m.status} lang={lang} />}</div>
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
