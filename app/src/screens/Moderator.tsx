import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { allUnits } from '../core';
import { api, apiOn, lastError, proofUrl } from '../api';
import { ProofThumb } from './Saarthi';
import { useTr } from '../ui/tr';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../ui/Icon';
import { Section, Toggle } from '../ui/Layer';

// M1: overview, counted on the server.
export function ModHome() {
  const { go, open } = useNav();
  const tr = useTr();
  const [o, setO] = useState<Awaited<ReturnType<typeof api.modOverview>> | undefined>(undefined);
  useEffect(() => {
    api.modOverview().then(setO);
  }, []);
  const tiles = o
    ? [
        { n: o.places, l: tr('Places on record', 'दर्ज जगहें'), go: undefined },
        { n: o.queue, l: tr('Waiting in the queue', 'कतार में बाकी'), go: () => go('m-queue') },
        { n: o.openTickets, l: tr('Open or escalated tickets', 'खुले या आगे भेजे टिकट'), go: () => go('m-queue') },
        { n: o.saarthis, l: tr('Saarthis', 'सारथी'), go: undefined },
        { n: o.users, l: tr('Accounts', 'अकाउंट'), go: undefined },
        { n: o.sos, l: tr('Emergency presses', 'आपात बटन'), go: () => go('m-alerts') },
      ]
    : [];
  return (
    <div className="screen">
      <p className="eyebrow">{tr('Moderator', 'मॉडरेटर')}</p>
      <h1 className="display">{tr('Overview', 'सार')}</h1>
      {o === undefined && <p className="muted">{tr('Loading', 'लोड हो रहा है')}</p>}
      {o === null && <p className="small error">{lastError}</p>}
      <div className="stat-grid">
        {tiles.map((t) => <button key={t.l} className="stat" onClick={t.go} disabled={!t.go}><b>{t.n}</b><small>{t.l}</small></button>)}
      </div>
      <button className="card row" onClick={() => open({ kind: 'look' })}>
        <Icon name="sparkle" size={22} /><span className="grow"><b>{tr('Your look', 'आपका रूप')}</b><small>{tr('Team frame, banner and theme', 'टीम फ़्रेम, बैनर और थीम')}</small></span><Icon name="arrow" size={16} />
      </button>
      <button className="card quick" onClick={() => go('m-twist')}>
        <span className="quick-icon"><Icon name="dice" size={22} /></span>
        <span><b>{tr('Twist panel', 'ट्विस्ट पैनल')}</b><small>{tr("Change today's conditions. The app replans live.", 'आज की स्थिति बदलें। ऐप तुरंत नया प्लान बनाता है।')}</small></span>
        <Icon name="arrow" size={18} />
      </button>
    </div>
  );
}

const QUEUE_KIND: Record<string, [string, string]> = {
  application: ['Saarthi application', 'सारथी आवेदन'],
  business: ['New shop', 'नई दुकान'],
  report: ['Reported content', 'रिपोर्ट की गई सामग्री'],
  flag: ['Flagged entry', 'फ़्लैग एंट्री'],
  ticket: ['Escalated ticket', 'आगे भेजा टिकट'],
  sponsor: ['Sponsor request', 'प्रायोजन अनुरोध'],
  fact: ["New saarthi's entry (first week)", 'नए सारथी की एंट्री (पहला हफ़्ता)'],
};

/** Proof photos load with the moderator's session. */
function Proofs({ ids }: { ids: string[] }) {
  const [items, setItems] = useState<{ url: string; type: string }[]>([]);
  useEffect(() => {
    Promise.all(ids.map(proofUrl)).then((u) => setItems(u.filter((x): x is { url: string; type: string } => !!x)));
  }, [ids]);
  return items.length ? <div className="proof-row">{items.map((x) => <ProofThumb key={x.url} url={x.url} type={x.type} />)}</div> : null;
}

// M2 + M3 + M6: queues. Only what people actually sent: applications, shops, reports, flags, tickets.
export function ModQueue() {
  const tr = useTr();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.modQueues>> | undefined>(undefined);
  useEffect(() => {
    api.modQueues().then(setItems);
  }, []);
  const decide = (id: string, ok: boolean) => {
    api.decide(id, ok).then((r) => r && setDone((d) => ({ ...d, [id]: ok })));
  };
  return (
    <div className="screen">
      <h1 className="display small">{tr('Queues', 'कतार')}</h1>
      {items === undefined && <p className="muted">{tr('Loading', 'लोड हो रहा है')}</p>}
      {items === null && <p className="small error">{lastError}</p>}
      {items?.length === 0 && <p className="muted">{tr('Nothing waiting.', 'कुछ बाकी नहीं।')}</p>}
      {items?.map((x) => (
        <div key={x.id} className={`card col${x.id in done ? ' dim' : ''}`}>
          <small className="eyebrow">{tr(...(QUEUE_KIND[x.kind] ?? [x.kind, x.kind]))}</small>
          <b>{x.title}</b>
          {x.detail && <small className="muted">{x.detail}</small>}
          {!!x.proof?.length && <Proofs ids={x.proof} />}
          {x.id in done ? <small><b>{done[x.id] ? tr('Approved', 'मंज़ूर') : tr('Rejected', 'नामंज़ूर')}</b></small> : (
            <div className="row-actions">
              <button className="btn primary" onClick={() => decide(x.id, true)}>{tr('Approve', 'मंज़ूर')}</button>
              <button className="btn ghost" onClick={() => decide(x.id, false)}>{tr('Reject', 'नामंज़ूर')}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Twist Card prep: change conditions and every raahi plan replans at once.
export function ModTwist() {
  const { s, set, data, plan } = useStore();
  const { lang } = useTheme();
  const tr = useTr();
  const units = allUnits(data).filter((u) => u.place.guardrail.status === 'level1' || u.place.guardrail.status === 'level2');
  const tw = s.twists;
  const setTw = (p: Partial<typeof tw>) => {
    set((c) => ({ twists: { ...c.twists, ...p }, order: null }));
    api.putTwists(p); // reaches every raahi when a backend is running
  };
  return (
    <div className="screen">
      <h1 className="display small">{tr('Twist panel', 'ट्विस्ट पैनल')}</h1>
      <p className="muted small">{tr("For the event's Twist Card. Every change replans the roadmap right away", 'इवेंट के ट्विस्ट कार्ड के लिए। हर बदलाव से रोडमैप तुरंत बदलता है')}{apiOn() ? tr(', on every connected phone', ', हर जुड़े फ़ोन पर') : ''}{tr('.', '।')}</p>
      <Section title={tr('Close a site today', 'आज कोई जगह बंद करें')}>
        <div className="chips">
          {units.map((u) => {
            const on = tw.closed.includes(u.unit.id);
            return (
              <button key={u.unit.id} className={`chip${on ? ' on danger' : ''}`} onClick={() => setTw({ closed: on ? tw.closed.filter((x) => x !== u.unit.id) : [...tw.closed, u.unit.id] })}>
                {on && <Icon name="x" size={14} />} {u.unit.name[lang]}
              </button>
            );
          })}
        </div>
      </Section>
      <Section title={tr('Crowded right now', 'अभी भीड़ है')} note={tr('Yatra tells raahis and suggests similar places that are open; the planner stops picking it. Any place, not only plannable ones.', 'यात्रा राहियों को बताती है और मिलती-जुलती खुली जगहें सुझाती है; प्लानर इसे नहीं चुनता। कोई भी जगह।')}>
        <div className="chips">
          {allUnits(data).filter((u) => u.place.units[0].id === u.unit.id || u.place.units.length > 1).map((u) => {
            const on = (tw.crowded ?? []).includes(u.unit.id);
            return (
              <button key={u.unit.id} className={`chip${on ? ' on warn' : ''}`} onClick={() => setTw({ crowded: on ? (tw.crowded ?? []).filter((x) => x !== u.unit.id) : [...(tw.crowded ?? []), u.unit.id] })}>
                {on && <Icon name="users" size={14} />} {u.unit.name[lang]}
              </button>
            );
          })}
        </div>
      </Section>
      <Section title={tr('Conditions', 'स्थितियाँ')}>
        <Toggle on={tw.budgetHalf} onChange={(v) => setTw({ budgetHalf: v })} label={tr('Budget halved (cheapest rides)', 'बजट आधा (सबसे सस्ती सवारी)')} />
        <Toggle on={tw.rain} onChange={(v) => setTw({ rain: v })} label={tr('Rain (no walking legs)', 'बारिश (पैदल नहीं)')} />
        <Toggle on={tw.festival} onChange={(v) => setTw({ festival: v })} label={tr('Festival crowd (daily limits reached)', 'त्योहार की भीड़ (दैनिक सीमा पूरी)')} />
        <Toggle on={s.testMode} onChange={(v) => { set({ testMode: v }); api.putTwists({ testMode: v }); }} label={tr('Stamp test mode (simulated location)', 'स्टैम्प टेस्ट मोड (नकली लोकेशन)')} />
      </Section>
      <motion.div key={JSON.stringify(tw)} className="card col" initial={{ scale: 0.97, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }}>
        <b>{tr('Live result', 'तुरंत नतीजा')}</b>
        <small className="muted">{plan ? `${plan.stops.length} ${tr('stops', 'जगहें')} · ₹${plan.budget.total.min}–${plan.budget.total.max} · ${tr('back by', 'वापसी')} ${Math.floor(plan.finish / 60)}:${String(plan.finish % 60).padStart(2, '0')}` : tr('No roadmap made yet. Make one as a raahi first.', 'अभी कोई रोडमैप नहीं। पहले राही बनकर बनाएँ।')}</small>
        {plan && <small>{plan.stops.map((x) => x.unit.name[lang]).join(' → ')}</small>}
      </motion.div>
    </div>
  );
}

// M4: emergency feed. Every press with its full date and time, the account that pressed it and how to reach
// them, where they were, and where their day was going. A moderator marks it handled with what they did.
type SosRow = Awaited<ReturnType<typeof api.sosFeed>> extends (infer T)[] | null ? T : never;

export function ModAlerts() {
  const { data } = useStore();
  const { lang } = useTheme();
  const tr = useTr();
  const [feed, setFeed] = useState<SosRow[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    const pull = () => api.sosFeed().then((f) => f && setFeed(f));
    pull();
    const id = setInterval(pull, 5000);
    return () => clearInterval(id);
  }, []);
  const name = (id: string) => data.places.find((p) => p.id === id || p.units.some((u) => u.id === id))?.name[lang] ?? id;
  const done = (id: string) => api.sosHandled(id, notes[id] ?? '').then((r) => r && setFeed((f) => (f ?? []).map((x) => (x.id === id ? { ...x, ...r } : x))));
  return (
    <div className="screen">
      <h1 className="display small">{tr('Emergency feed', 'आपात सूचनाएँ')}</h1>
      <p className="muted small">{tr('When a raahi presses the emergency button it calls 112 and appears here within 5 seconds, with their account and shared location.', 'राही के आपात बटन दबाने पर 112 कॉल होता है और 5 सेकंड में यहाँ उनके अकाउंट और साझा लोकेशन के साथ दिखता है।')}</p>
      {feed === null && <p className="muted">{tr('Loading', 'लोड हो रहा है')}</p>}
      {feed?.length === 0 && <div className="card"><Icon name="shield" size={22} /><span className="grow"><b>{tr('No alerts', 'कोई सूचना नहीं')}</b></span></div>}
      {feed?.map((f) => {
        const a = f.account;
        return (
          <div key={f.id} className={`card col sos-card${f.status === 'handled' ? ' dim' : ''}`}>
            <div className="biz-top">
              <b><Icon name="shield" size={18} /> {f.date ?? ''} {f.time} IST</b>
              <span className={`status ${f.status === 'handled' ? 'answered' : 'open'}`}>{f.status === 'handled' ? tr('Handled', 'संभाला') : tr('Open', 'खुला')}</span>
            </div>
            <dl className="sos-dl">
              <dt>{tr('Account', 'अकाउंट')}</dt>
              <dd>{a ? `${a.name ?? '—'} · ${a.email ?? tr('no email', 'ईमेल नहीं')} · ${a.signIn} · ID ${a.id}` : tr('Guest (not signed in)', 'मेहमान (साइन इन नहीं)')}</dd>
              {a && <><dt>{tr('Roles, joined', 'भूमिका, जुड़े')}</dt><dd>{a.roles.join(', ')} · {a.joined ?? '—'} · {a.points} {tr('points', 'पॉइंट')}</dd></>}
              <dt>{tr('Location', 'लोकेशन')}</dt>
              <dd>{f.lat != null && f.lng != null ? (
                <a href={`https://maps.google.com/?q=${f.lat},${f.lng}`} target="_blank" rel="noreferrer">{f.lat.toFixed(5)}, {f.lng.toFixed(5)}{f.accuracy ? ` (±${Math.round(f.accuracy)} m)` : ''}</a>
              ) : tr('Not shared', 'साझा नहीं')}{f.city ? ` · ${f.city}` : ''}</dd>
              {a?.lastStamp && <><dt>{tr('Last place checked in', 'आख़िरी चेक-इन')}</dt><dd>{name(a.lastStamp.place)} · {a.lastStamp.date} {a.lastStamp.time}</dd></>}
              {a?.lastPlan && <><dt>{tr("Day's plan", 'दिन की योजना')}</dt><dd>{a.lastPlan.date}: {a.lastPlan.stops.map(name).join(' → ') || '—'}{a.lastPlan.done.length ? ` · ${tr('done', 'पूरा')}: ${a.lastPlan.done.map(name).join(', ')}` : ''}</dd></>}
              {a && Object.keys(a.group).length > 0 && <><dt>{tr('Travelling with', 'साथ में')}</dt><dd>{JSON.stringify(a.group)}</dd></>}
              {a && a.earlierPresses > 0 && <><dt>{tr('Earlier presses', 'पहले दबाया')}</dt><dd>{a.earlierPresses}</dd></>}
              {f.note && <><dt>{tr('Note', 'नोट')}</dt><dd>{f.note}</dd></>}
              {f.status === 'handled' && <><dt>{tr('Handled by', 'किसने संभाला')}</dt><dd>{f.handledBy} · {f.handledAt}{f.handledNote ? ` · ${f.handledNote}` : ''}</dd></>}
            </dl>
            {f.status !== 'handled' && (
              <div className="row-actions">
                <input value={notes[f.id] ?? ''} onChange={(e) => setNotes({ ...notes, [f.id]: e.target.value })} placeholder={tr('What was done (called back, sent help)', 'क्या किया (कॉल किया, मदद भेजी)')} />
                <button className="btn primary" onClick={() => done(f.id)}>{tr('Mark handled', 'संभाला')}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// M5: news watch. Local headlines are pulled once a day per city. Nothing reaches raahis until approved.
export function ModNews() {
  const tr = useTr();
  const [state, setState] = useState<Record<string, 'ok' | 'no'>>({});
  const [list, setList] = useState<Awaited<ReturnType<typeof api.news>> | undefined>(undefined);
  useEffect(() => {
    api.news().then(setList);
  }, []);
  const decide = (id: string, ok: boolean) => {
    api.decideNews(id, ok).then((r) => r && setState((st) => ({ ...st, [id]: ok ? 'ok' : 'no' })));
  };
  return (
    <div className="screen">
      <h1 className="display small">{tr('News watch', 'ख़बरों पर नज़र')}</h1>
      <p className="muted small">{tr('Local headlines for Gwalior and Indore, pulled once a day. Nothing reaches raahis until you approve it.', 'ग्वालियर और इंदौर की स्थानीय ख़बरें, रोज़ एक बार। आपकी मंज़ूरी के बिना राहियों तक कुछ नहीं पहुँचता।')}</p>
      {list === undefined && <p className="muted">{tr('Loading', 'लोड हो रहा है')}</p>}
      {list === null && <p className="small error">{lastError}</p>}
      {list?.length === 0 && <p className="muted">{tr('No news yet today.', 'आज अभी कोई ख़बर नहीं।')}</p>}
      {list?.map((a) => {
        const st = state[a.id] ?? (a.status === 'approved' ? 'ok' : a.status === 'rejected' ? 'no' : undefined);
        return (
          <div key={a.id} className={`card col${st ? ' dim' : ''}`}>
            <b>{a.en}</b>
            <small className="muted">{a.city ? `${a.city} · ` : ''}{a.link ? <a href={a.link} target="_blank" rel="noreferrer">{a.source}</a> : a.source} · {a.at}</small>
            {st ? <small><b>{st === 'ok' ? tr('Approved, sent to raahis', 'मंज़ूर, राहियों को भेजा') : tr('Rejected', 'नामंज़ूर')}</b></small> : (
              <div className="row-actions">
                <button className="btn primary" onClick={() => decide(a.id, true)}>{tr('Approve', 'मंज़ूर')}</button>
                <button className="btn ghost" onClick={() => decide(a.id, false)}>{tr('Reject', 'नामंज़ूर')}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
