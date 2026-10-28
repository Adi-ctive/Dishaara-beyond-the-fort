import { motion } from 'motion/react';
import { useEffect } from 'react';
import { checkUnit, isUnavailable, type Fact, type Unit } from '../../core';
import { StampArt, rarityOf } from '../../art/Stamp';
import { PlaceCover, artFor } from '../../art/PlaceCover';
import { useNav } from '../../nav';
import { award, todayIST, useStore } from '../../store';
import { useTheme, type Lang } from '../../theme/ThemeProvider';
import { ConfirmWhat, FactLine, LiveAlert, TrustChip, VERDICT_TEXT, tx } from '../../ui/facts';
import { Icon } from '../../ui/Icon';
import { LayerPage, Section } from '../../ui/Layer';
import { speak } from '../../voice';
import { api } from '../../api';
import { Feed } from '../Social';
import { useGate } from '../../ui/SignIn';

function Fees({ u, lang }: { u: Unit; lang: Lang }) {
  const { data } = useStore();
  const rows = u.fees.v?.rows ?? [];
  if (isUnavailable(u.fees) || !rows.length) return <FactLine title={lang === 'hi' ? 'टिकट' : 'Tickets'} f={u.fees} lang={lang} data={data} />;
  const money = (n?: number | null) => (n === null || n === undefined ? '—' : n === 0 ? (lang === 'hi' ? 'मुफ़्त' : 'Free') : `₹${n}`);
  return (
    <div className="fact">
      <div className="fact-head">
        <span className="fact-title">{lang === 'hi' ? 'टिकट' : 'Tickets'}</span>
        <TrustChip f={u.fees} lang={lang} data={data} />
      </div>
      {u.fees.s === 'conflicting' && <p className="small muted">{lang === 'hi' ? 'ऑनलाइन बताई गई कीमतें, पक्की नहीं:' : 'Prices reported online, not confirmed:'}</p>}
      <table className="fees">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.label[lang]}</td>
              <td>{r.any !== undefined ? money(r.any) : `${money(r.cash)} ${lang === 'hi' ? 'नकद' : 'cash'} · ${money(r.online)} ${lang === 'hi' ? 'ऑनलाइन' : 'online'}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {u.fees.s === 'conflicting' && u.fees.why && <p className="fact-warn">{u.fees.why[lang]}</p>}
    </div>
  );
}

// R5: the place template. Rules first for worship and contested sites, then the visit check,
// then facts with their stamps, then plainly what is not known.
export function PlaceView({ id }: { id: string }) {
  const { data, today, s, set, plan } = useStore();
  const { lang } = useTheme();
  const { open, go, closeAll } = useNav();
  const hi = lang === 'hi';
  const p = data.places.find((x) => x.id === id)!;
  const rarity = rarityOf(p);
  const st = s.stillTrue[id] ?? { yes: 0, no: 0 };
  const inPlan = s.added.includes(id) || !!plan?.stops.some((x) => x.place.id === id);

  const unknown: string[] = [];
  const note = (label: string, f?: Fact) => isUnavailable(f) && unknown.push(label);
  note(hi ? 'पहुँच (व्हीलचेयर आदि)' : 'Access (wheelchair, steps)', p.accessibility);
  note(hi ? 'सुविधाएँ' : 'Facilities', p.facilities);
  note(hi ? 'संपर्क' : 'Contact', p.contact);
  for (const u of p.units) note(`${u.name[lang]}: ${hi ? 'आख़िरी प्रवेश' : 'last entry'}`, u.lastEntry);
  if (p.sensitive) {
    note(hi ? 'पहनावे के नियम' : 'Dress rules', p.sensitive.dress);
    note(hi ? 'पूजा का समय' : 'Worship timings', p.sensitive.worship);
  }

  const gate = useGate();
  // Reading a place page counts for the "read 3 place pages" quest (signed in only, once per place, on the server).
  useEffect(() => {
    if (s.signedIn) api.readPlace(id);
  }, [id, s.signedIn]);
  const tap = (yes: boolean) => {
    api.stillTrue(id, yes);
    set((c) => (c.awarded.includes(`still:${id}:${todayIST()}`) ? {} : { stillTrue: { ...c.stillTrue, [id]: { yes: st.yes + (yes ? 1 : 0), no: st.no + (yes ? 0 : 1) } }, facts: c.facts + 1, ...award(c, `still:${id}:${todayIST()}`, 5) }));
  };

  return (
    <LayerPage title={p.name[lang]}>
      <motion.div className="place-hero2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ ['--pcink' as string]: artFor(id).ink }}>
        {p.photo ? <img className="ph-photo" src={p.photo.img} alt={p.name[lang]} loading="lazy" /> : <PlaceCover id={id} height={190} />}
        <span className="pc-shade" />
        <div className="ph-text">
          <p className="ph-type">{p.type[lang]}</p>
          <h1 className="ph-name">{p.name[lang]}</h1>
          {rarity === 'rare' && <span className="pc-rare static">★ {hi ? 'दुर्लभ स्टैम्प' : 'Rare stamp'}</span>}
        </div>
        <motion.span className={`ph-stamp${s.stamps[id] ? ' got' : ''}`} initial={{ scale: 0.6, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} transition={{ type: 'spring', damping: 14 }}>
          <StampArt place={p} got={!!s.stamps[id]} rarity={rarity} size={78} />
        </motion.span>
      </motion.div>

      {p.photo && (
        <p className="photo-credit small muted">
          {hi ? 'फ़ोटो' : 'Photo'}: {p.photo.page ? <a href={p.photo.page} target="_blank" rel="noreferrer">{p.photo.author}</a> : p.photo.author}, {p.photo.license}{p.photo.page.includes('wikimedia') ? ', Wikimedia Commons' : ''}
        </p>
      )}
      {!isUnavailable(p.summary) && <p className="place-lede">{tx(p.summary, lang)}</p>}
      {!!p.official?.length && (
        <div className="official-links">
          <b className="small">{hi ? 'और पढ़ें, आधिकारिक साइट पर' : 'Read more on the official website'}</b>
          {p.official.map((o) => (
            <a key={o.url} className="card row" href={o.url} target="_blank" rel="noreferrer">
              <Icon name="verify" size={18} /><span className="grow">{o.name}</span><Icon name="arrow" size={16} />
            </a>
          ))}
        </div>
      )}

      <div className="row-actions">
      <button className="btn primary map-jump" onClick={() => open({ kind: 'story', id })}>
        <Icon name="play" size={18} /> {hi ? 'कहानी की तरह देखें' : 'View as story'}
      </button>
      <button className="btn ghost map-jump" onClick={() => { set({ mapFocus: id }); closeAll(); go('map'); }}>
        <Icon name="map" size={18} /> {hi ? 'नक्शे पर देखें' : 'Show on map'}
      </button>
      </div>

      {p.sensitive && (
        <div className="rules-first">
          <b>{hi ? 'जाने से पहले: इस जगह के नियम' : 'Before you go: rules for this place'}</b>
          <FactLine title={hi ? 'पहनावा' : 'Dress'} f={p.sensitive.dress} lang={lang} data={data} />
          {p.sensitive.worship && <FactLine title={hi ? 'पूजा का समय' : 'Worship timings'} f={p.sensitive.worship} lang={lang} data={data} />}
        </div>
      )}

      {p.units.map((u) => {
        const c = checkUnit(data, u, today);
        const vt = VERDICT_TEXT[c.verdict];
        return (
          <Section key={u.id} title={p.units.length > 1 ? u.name[lang] : hi ? 'आज जा सकते हैं?' : 'Can I go today?'}>
            <div className={`verdict-banner ${vt.tone}`}>
              <b>{vt[lang]}</b>
              <span className="small">{hi ? 'नियमों से तय, AI से नहीं' : 'Decided by rules, not by AI'}</span>
            </div>
            <LiveAlert p={{ ...p, units: [u] }} twists={s.twists} lang={lang} />
            <ConfirmWhat c={c} data={data} p={p} u={u} lang={lang} />
            <FactLine title={hi ? 'समय' : 'Hours'} f={u.hours} lang={lang} data={data} />
            <FactLine title={hi ? 'साप्ताहिक बंदी' : 'Weekly closing'} f={u.weeklyClosed} lang={lang} data={data} />
            <Fees u={u} lang={lang} />
            <FactLine title={hi ? 'भुगतान' : 'Payment'} f={u.payment} lang={lang} data={data} />
            <FactLine title={hi ? 'कितना समय लगेगा' : 'Time needed'} f={u.minVisit} lang={lang} data={data} />
            <FactLine title={hi ? 'संरक्षक' : 'Custodian'} f={u.custodian} lang={lang} data={data} />
          </Section>
        );
      })}

      <Section title={hi ? 'जगह के बारे में' : 'About'}>
        <FactLine title={hi ? 'सार' : 'Summary'} f={p.summary} lang={lang} data={data} />
        {!isUnavailable(p.accessibility) && <FactLine title={hi ? 'पहुँच' : 'Access'} f={p.accessibility} lang={lang} data={data} />}
        {!isUnavailable(p.facilities) && <FactLine title={hi ? 'सुविधाएँ' : 'Facilities'} f={p.facilities} lang={lang} data={data} />}
        {!isUnavailable(p.contact) && <FactLine title={hi ? 'संपर्क' : 'Contact'} f={p.contact} lang={lang} data={data} />}
        {p.rules.map((r, i) => (
          <FactLine key={i} title={r.kind === 'mandatory' ? (hi ? 'ज़रूरी नियम' : 'Must follow') : r.kind === 'safety' ? (hi ? 'सुरक्षा' : 'Safety') : hi ? 'शिष्टाचार' : 'Courtesy'} f={r} lang={lang} data={data} />
        ))}
        {p.notes.map((n, i) => (
          <FactLine key={`n${i}`} title={hi ? 'नोट' : 'Note'} f={n} lang={lang} data={data} />
        ))}
      </Section>

      {!!p.activities?.length && (
        <Section title={hi ? 'यहाँ क्या कर सकते हैं' : 'Things to do here'}>
          {p.activities.map((a) => (
            <FactLine key={a.id} title={a.name[lang]} f={a} lang={lang} data={data} />
          ))}
        </Section>
      )}

      {!!p.faqs?.length && (
        <Section title={hi ? 'अक्सर पूछे जाने वाले सवाल' : 'Questions people ask'} note={hi ? 'जवाब ऊपर दर्ज तथ्यों से।' : 'Answers come from the facts on record above.'}>
          {p.faqs.map((f) => (
            <details key={f.from} className="faq">
              <summary>{f.q[lang]}</summary>
              <p>{f.a[lang]}</p>
            </details>
          ))}
        </Section>
      )}

      <Section title={hi ? 'हमें क्या नहीं पता' : "What we don't know"} note={hi ? 'हम अंदाज़ा नहीं लगाते।' : 'We never guess these.'}>
        {unknown.length ? (
          <ul className="unknown-list">
            {unknown.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">{hi ? 'सब कुछ दर्ज है।' : 'Everything on the template is on record.'}</p>
        )}
      </Section>

      <Section title={hi ? 'सुनें' : 'Listen'}>
        <button className="card row" onClick={() => speak(tx(p.summary, lang) || p.name[lang], lang)}>
          <span className="play"><Icon name="play" size={18} /></span>
          <span className="grow"><b>{hi ? 'सार सुनें' : 'Hear the summary'}</b><small>{hi ? 'ऊपर दर्ज सार से' : 'From the summary on record'}</small></span>
        </button>
      </Section>

      <Section title={hi ? 'इस जगह के बारे में पोस्ट' : 'Posts about this place'}>
        <Feed place={id} />
      </Section>

      <Section title={hi ? 'क्या यह अभी भी सही है?' : 'Still true?'} note={hi ? 'यहाँ हैं? एक टैप से मदद करें।' : 'At the place? One tap helps everyone.'}>
        <div className="still">
          <button className="pill" onClick={gate(() => tap(true))}><Icon name="thumb" size={16} /> {hi ? 'हाँ, खुला है' : 'Yes, it is open'}</button>
          <button className="pill" onClick={gate(() => tap(false))}><Icon name="flag" size={16} /> {hi ? 'नहीं, कुछ अलग है' : 'No, something differs'}</button>
        </div>
        {s.awarded.includes(`still:${id}:${todayIST()}`) ? <p className="muted small">{hi ? 'धन्यवाद, आज का जवाब दर्ज हुआ · +5 पॉइंट' : 'Thanks, your answer for today is recorded · +5 points'}</p> : <p className="muted small">{hi ? 'दिन में एक बार, +5 पॉइंट' : 'Once a day, +5 points'}</p>}
      </Section>

      <div className="place-actions">
        <button className="btn ghost" onClick={() => !plan?.stops.some((x) => x.place.id === id) && set((c) => ({ added: inPlan ? c.added.filter((x) => x !== id) : [...c.added, id], quick: c.quick ?? { hours: 6, startPoint: 'station', start: '09:00' }, order: null }))}>
          <Icon name={inPlan ? 'check' : 'plus'} size={18} /> {inPlan ? (hi ? 'रोडमैप में है' : 'In your roadmap') : hi ? 'रोडमैप में जोड़ें' : 'Add to roadmap'}
        </button>
        <button className="btn primary" onClick={gate(() => open({ kind: 'stamp', id }))}>
          <Icon name="stamp" size={18} /> {s.stamps[id] ? (hi ? 'स्टैम्प मिला' : 'Stamp collected') : hi ? 'स्टैम्प लें' : 'Collect stamp'}
        </button>
        <button className="btn ghost" onClick={gate(() => open({ kind: 'feedback', id }))}>
          <Icon name="edit" size={18} /> {hi ? 'फ़ीडबैक' : 'Feedback'}
        </button>
      </div>
    </LayerPage>
  );
}
