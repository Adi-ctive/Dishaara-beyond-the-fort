// Event-day tools: the Baseline Duel comparison and the one-page system diagram for Blackout Defence.
import { allUnits, type Fact, type Unit } from '../core';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme/ThemeProvider';
import { TrustChip } from '../ui/facts';
import { Icon } from '../ui/Icon';
import { LayerPage, Section } from '../ui/Layer';
import { useTr } from '../ui/tr';

// The prompt we gave three AIs on 16 Oct (03_conversations/shared_links_export/16 to 18).
export const DUEL_PROMPT =
  "I'm visiting Gwalior for the first time on 20 October 2026. I arrive at Gwalior railway station at 10 AM and leave at 6 PM the same day. I like history and local food, I'll use autos, and my budget is ₹1,500. Plan my day with times, entry fees and travel costs between places.";

// What each AI said, quoted from those saved chats. "—" means it did not say.
type Row = { topic: [string, string]; unit: string; gemini: string; chatgpt: string; grok: string };
const ROWS: Row[] = [
  { topic: ['Gwalior Fort entry, Indian adult', 'ग्वालियर किला प्रवेश, भारतीय वयस्क'], unit: 'fort-asi', gemini: '₹75 "ASI monument ticket"', chatgpt: '₹75 allowance', grok: '₹75' },
  { topic: ['Sas-Bahu Temples entry', 'सास-बहू मंदिर प्रवेश'], unit: 'sas-bahu', gemini: '—', chatgpt: '—', grok: 'Free' },
  { topic: ['Gujari Mahal museum entry', 'गूजरी महल संग्रहालय प्रवेश'], unit: 'fort-gujari', gemini: '—', chatgpt: '₹10', grok: '≈₹25' },
  { topic: ['Jai Vilas Palace entry', 'जय विलास महल प्रवेश'], unit: 'jai-vilas', gemini: '₹350', chatgpt: '₹550, so skips it', grok: '≈₹100–150, closes 4:30–5 PM' },
  { topic: ['Tomb of Tansen entry', 'तानसेन का मकबरा प्रवेश'], unit: 'tansen-tomb', gemini: 'Free', chatgpt: '—', grok: 'Free' },
];

function ours(u: Unit, lang: 'en' | 'hi'): string {
  const rows = u.fees.v?.rows ?? [];
  if (u.fees.s === 'conflicting') return lang === 'hi' ? 'स्रोत अलग-अलग, कोई एक कीमत नहीं' : 'Sources disagree, no single price';
  if (!rows.length) return lang === 'hi' ? 'दर्ज नहीं' : 'Not on record';
  const r = rows.find((x) => x.who === 'indian');
  if (!r) return '—';
  if (r.any !== undefined && r.any !== null) return `₹${r.any}`;
  return `₹${r.cash} ${lang === 'hi' ? 'नकद' : 'cash'} · ₹${r.online} ${lang === 'hi' ? 'ऑनलाइन' : 'online'}`;
}

// A claim "matches" only if its number equals our confirmed number. Anything else is flagged.
export function verdict(claim: string, u: Unit): 'match' | 'differs' | 'unsure' | 'none' {
  if (claim === '—') return 'none';
  if (u.fees.s === 'conflicting' || !u.fees.v) return 'unsure';
  const ourNums = (u.fees.v.rows.filter((r) => r.who === 'indian').flatMap((r) => [r.any, r.cash, r.online]).filter((n) => typeof n === 'number') as number[]);
  const theirs = (claim.match(/\d+/g) ?? []).map(Number);
  if (/free/i.test(claim)) return ourNums.some((n) => n > 0) ? 'differs' : 'match';
  return theirs.length && theirs.every((n) => ourNums.includes(n)) ? 'match' : 'differs';
}

const MARK = { match: ['ok', '✓'], differs: ['bad', '✗'], unsure: ['weak', '?'], none: ['muted', '—'] } as const;

export function Duel() {
  const { data, set } = useStore();
  const { lang } = useTheme();
  const { closeAll, go } = useNav();
  const tr = useTr();
  const units = allUnits(data);
  const unitOf = (id: string) => units.find((x) => x.unit.id === id)!.unit;
  const run = () => {
    set({ quick: { hours: 8, startPoint: 'station', start: '10:00' }, order: null, done: [], interests: ['history', 'food'] });
    closeAll();
    go('roadmap');
  };
  return (
    <LayerPage title={tr('Baseline Duel', 'बेसलाइन ड्यूल')}>
      <Section title={tr('The prompt', 'सवाल')} note={tr('Given to Gemini, ChatGPT and Grok on 16 Oct 2026. Saved chats 16 to 18.', '16 अक्टूबर 2026 को Gemini, ChatGPT और Grok से पूछा गया। सहेजी चैट 16 से 18।')}>
        <blockquote className="duel-prompt">{DUEL_PROMPT}</blockquote>
        <button className="btn primary" onClick={run}><Icon name="route" size={18} /> {tr('Run it in Dishaara', 'इसे दिशारा में चलाएँ')}</button>
        <p className="small muted">{tr('Our planner uses today\'s date and opening rules, starting 10:00 from the station for 8 hours.', 'हमारा प्लानर आज की तारीख और नियम लेता है, स्टेशन से 10:00 बजे, 8 घंटे।')}</p>
      </Section>
      <Section title={tr('Fees: what each said vs our checked record', 'शुल्क: किसने क्या कहा, हमारा जाँचा रिकॉर्ड')}>
        <div className="duel-legend small"><span className="mark ok">✓</span> {tr('matches our record', 'रिकॉर्ड से मेल')} <span className="mark bad">✗</span> {tr('differs', 'अलग')} <span className="mark weak">?</span> {tr('stated with certainty where sources disagree', 'स्रोत अलग होने पर भी पक्का बताया')}</div>
        {ROWS.map((r) => {
          const u = unitOf(r.unit);
          const f: Fact = u.fees;
          return (
            <div key={r.unit} className="duel-row card col">
              <b>{tr(...r.topic)}</b>
              {(['gemini', 'chatgpt', 'grok'] as const).map((ai) => {
                const v = verdict(r[ai], u);
                return (
                  <div key={ai} className="duel-ai">
                    <span className="duel-who">{ai === 'chatgpt' ? 'ChatGPT' : ai === 'gemini' ? 'Gemini' : 'Grok'}</span>
                    <span className="grow">{r[ai]}</span>
                    <span className={`mark ${MARK[v][0]}`}>{MARK[v][1]}</span>
                  </div>
                );
              })}
              <div className="duel-ai ours">
                <span className="duel-who">Dishaara</span>
                <span className="grow">{ours(u, lang)}</span>
                <TrustChip f={f} lang={lang} data={data} />
              </div>
              {u.fees.s === 'conflicting' && u.fees.why && <p className="fact-warn">{u.fees.why[lang]}</p>}
            </div>
          );
        })}
      </Section>
      <Section title={tr('What to say in the duel', 'ड्यूल में क्या कहें')}>
        <ul className="steps-list">
          <li>{tr('All three gave the fort fee as ₹75. The ASI rules say ₹25 cash or ₹20 online for Indians.', 'तीनों ने किले का शुल्क ₹75 बताया। ASI नियम भारतीयों के लिए ₹25 नकद या ₹20 ऑनलाइन कहते हैं।')}</li>
          <li>{tr('Jai Vilas got three different prices. We show none as certain and say why.', 'जय विलास की तीन अलग कीमतें मिलीं। हम कोई कीमत पक्की नहीं बताते और कारण बताते हैं।')}</li>
          <li>{tr('Every Dishaara fact carries a label and a date. The AIs gave none.', 'दिशारा की हर जानकारी पर लेबल और तारीख है। AI ने कोई नहीं दी।')}</li>
          <li>{tr('Our timings and verdicts come from rules, not from the model.', 'हमारे समय और फ़ैसले नियमों से आते हैं, मॉडल से नहीं।')}</li>
        </ul>
      </Section>
    </LayerPage>
  );
}

// One-page system diagram to redraw from memory in Blackout Defence. Printable.
export function Diagram() {
  const tr = useTr();
  const box = (x: number, y: number, w: number, h: number, title: string, sub: string, kind: string) => (
    <g transform={`translate(${x} ${y})`} className={`dg ${kind}`}>
      <rect width={w} height={h} rx="10" />
      <text x={w / 2} y={h / 2 - 3} textAnchor="middle" className="dg-t">{title}</text>
      <text x={w / 2} y={h / 2 + 12} textAnchor="middle" className="dg-s">{sub}</text>
    </g>
  );
  const arrow = (d: string, label?: string, lx?: number, ly?: number) => (
    <g className="dg-arrow">
      <path d={d} markerEnd="url(#ah)" />
      {label && <text x={lx} y={ly} className="dg-l">{label}</text>}
    </g>
  );
  return (
    <LayerPage title={tr('System diagram', 'सिस्टम डायग्राम')} actions={<button className="icon-btn" onClick={() => print()} aria-label="Print"><Icon name="share" size={18} /></button>}>
      <p className="small muted no-print">{tr('Redraw this from memory for Blackout Defence. The print button gives one A4 page.', 'ब्लैकआउट डिफ़ेंस के लिए इसे याद से बनाएँ। प्रिंट बटन से एक A4 पेज।')}</p>
      <svg viewBox="0 0 360 560" className="diagram printable" role="img" aria-label="Dishaara system diagram">
        <defs>
          <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5 0 10z" className="dg-head" />
          </marker>
        </defs>
        <text x="180" y="22" textAnchor="middle" className="dg-title">Dishaara</text>
        {box(10, 40, 100, 50, 'Raahi app', 'plan · chat · stamps', 'people')}
        {box(130, 40, 100, 50, 'Saarthi app', 'facts · proof · tickets', 'people')}
        {box(250, 40, 100, 50, 'Business', 'Bazaar listing', 'people')}
        {box(70, 150, 220, 54, 'Backend API', 'checks every request', 'core')}
        {arrow('M96 90 V150', '', 0, 0)}
        {arrow('M180 90 V150', '', 0, 0)}
        {arrow('M266 90 V150', '', 0, 0)}
        {box(10, 250, 150, 54, 'Verification', '2nd saarthi or official', 'rule')}
        {box(200, 250, 150, 54, 'Moderators', 'queues · twists · SOS', 'people')}
        {arrow('M150 204 L100 250')}
        {arrow('M210 204 L260 250')}
        {box(10, 350, 150, 60, 'Facts database', 'label · date · source', 'data')}
        {arrow('M85 304 V350', 'approved', 92, 330)}
        {box(200, 350, 150, 60, 'Retrieval agent', 'reads facts, builds pack', 'rule')}
        {arrow('M160 380 H200')}
        {box(200, 450, 150, 54, 'Chatbot (Groq)', 'sees only the pack', 'ai')}
        {arrow('M275 410 V450')}
        {box(10, 450, 150, 54, 'Rules engine', 'verdicts · timings', 'rule')}
        {arrow('M85 410 V450')}
        {arrow('M275 504 V528 H4 V65 H10', 'reply checked: every number, every place', 12, 544)}
        {box(280, 104, 72, 38, 'News AI', 'mod first', 'ai')}
        {box(14, 104, 72, 38, 'SOS', '112 + mods', 'alert')}
      </svg>
      <ul className="steps-list small">
        <li>{tr('People: raahi, saarthi, business, moderator.', 'लोग: राही, सारथी, व्यवसाय, मॉडरेटर।')}</li>
        <li>{tr('Facts enter only after verification, always with a label, date and source.', 'जानकारी जाँच के बाद ही आती है, हमेशा लेबल, तारीख और स्रोत के साथ।')}</li>
        <li>{tr('Rules decide verdicts and timings. The chatbot only words them.', 'फ़ैसले और समय नियम तय करते हैं। चैटबॉट सिर्फ़ शब्द देता है।')}</li>
        <li>{tr('The chatbot never touches the database. Its reply is checked before you see it.', 'चैटबॉट डेटाबेस को कभी नहीं छूता। जवाब आपको दिखने से पहले जाँचा जाता है।')}</li>
      </ul>
    </LayerPage>
  );
}
