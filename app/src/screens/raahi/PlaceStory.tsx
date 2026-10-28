// A place as a set of story cards, like Spotify Wrapped or Instagram stories: one idea per card,
// big type, the place's own colours. Tap the right side or swipe left for the next card.
// Every card is built from the checked record; nothing here is written by hand per place.
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { checkUnit, confirmItems, fmt, guardrail, haversineKm, isUnavailable, makeLeg, people, ROAD_FACTOR, startCoord, startName, windowFor, type Fact, type Place, type Unit } from '../../core';
import { Avatar } from '../../art/Avatars';
import { PlaceCover, artFor } from '../../art/PlaceCover';
import { StampArt, rarityOf } from '../../art/Stamp';
import { useLiveFeed } from '../Social';
import { useNav } from '../../nav';
import { useStore } from '../../store';
import { useTheme, type Lang } from '../../theme/ThemeProvider';
import { ConfirmWhat, LiveAlert, LABEL_TEXT, VERDICT_TEXT, dateText, sourceName, tx } from '../../ui/facts';
import { Icon } from '../../ui/Icon';
import { useGate } from '../../ui/SignIn';
import { useTr } from '../../ui/tr';

type Slide = { key: string; render: () => ReactNode };

function Sure({ f, lang }: { f?: Fact; lang: Lang }) {
  if (!f || isUnavailable(f) || !f.s) return <span className="st-sure weak">{lang === 'hi' ? 'अभी पता नहीं' : 'Not known yet'}</span>;
  const l = LABEL_TEXT[f.s];
  return (
    <span className={`st-sure ${l.tone}`}>
      {l[lang]}
      {f.ver && ` · ${dateText(f.ver)}`}
    </span>
  );
}

const money = (n: number | null | undefined, lang: Lang) => (n === null || n === undefined ? '—' : n === 0 ? (lang === 'hi' ? 'मुफ़्त' : 'Free') : `₹${n}`);

function unknownsOf(p: Place, lang: Lang): string[] {
  const hi = lang === 'hi';
  const out: string[] = [];
  const add = (label: string, f?: Fact) => isUnavailable(f) && out.push(label);
  add(hi ? 'पहुँच: व्हीलचेयर, सीढ़ियाँ' : 'Access: wheelchair, steps', p.accessibility);
  add(hi ? 'सुविधाएँ: शौचालय, पानी' : 'Facilities: toilets, water', p.facilities);
  add(hi ? 'संपर्क' : 'A contact number', p.contact);
  for (const u of p.units) add(`${u.name[lang]}: ${hi ? 'आख़िरी प्रवेश' : 'last entry'}`, u.lastEntry);
  if (p.sensitive) {
    add(hi ? 'पहनावे के नियम' : 'Dress rules', p.sensitive.dress);
    add(hi ? 'पूजा का समय' : 'Worship timings', p.sensitive.worship);
  }
  for (const u of p.units) if (u.fees.s === 'conflicting') out.push(`${u.name[lang]}: ${hi ? 'टिकट की कीमत (स्रोत अलग-अलग)' : 'ticket price (sources disagree)'}`);
  return out;
}

export function PlaceStory({ id }: { id: string }) {
  const { data, today, s, set, plan } = useStore();
  const { lang } = useTheme();
  const { back, open, replace, go, closeAll } = useNav();
  const tr = useTr();
  const gate = useGate();
  const p = data.places.find((x) => x.id === id)!;
  const a = artFor(id);
  const u: Unit = p.units[0];
  const check = checkUnit(data, u, today);
  const verdict = check.verdict;
  const vt = VERDICT_TEXT[verdict];
  const rarity = rarityOf(p);
  const unknown = unknownsOf(p, lang);
  const posts = (useLiveFeed({ place: id }) ?? []).filter((x) => !x.biz);
  const inPlan = s.added.includes(id) || !!plan?.stops.some((x) => x.place.id === id);
  const sources = [...new Set([u.hours, u.weeklyClosed, u.fees, p.summary, ...p.rules].filter((f) => f && !isUnavailable(f) && f.src).map((f) => f!.src!))];

  const slides: Slide[] = [];
  // Seven cards at most, ordered the way a visitor decides: should I go, what to sort out first, when,
  // what it costs, how to get there, what is there, how sure we are. Each card fills the screen from the top.
  const w = windowFor(data, u, today);
  const indian = (u.fees.v?.rows ?? []).find((r) => r.who === 'indian');
  const price = u.fees.s === 'conflicting' ? null : indian ? (indian.any ?? indian.cash ?? indian.online) : undefined;
  const from = s.quick?.startPoint ?? data.landmarks[0]?.id;
  const leg = from ? makeLeg(data, startCoord(data, from), u.coord, { modes: s.prefs.modes.length ? s.prefs.modes : ['walk', 'auto'], walking: s.prefs.walking, budget: s.prefs.budget, insideFort: false, people: people(s.prefs.group) }) : null;
  const MODE = { walk: tr('on foot', 'पैदल'), auto: tr('by auto', 'ऑटो से'), cab: tr('by cab', 'कैब से') };
  // Decision 28: no nearby list on an unflagged place's pages, and a list holds Level 2 places only.
  const near = (p.guardrail.status !== 'level2' ? [] : data.places)
    .filter((q) => q.id !== id && guardrail(q, today).level === 2)
    .map((q) => ({ q, km: haversineKm(u.coord, q.units[0].coord) * ROAD_FACTOR }))
    .sort((x, y) => x.km - y.km)
    .slice(0, 3);
  const confirm = confirmItems(check, lang);
  const mustKnow = [...p.rules.filter((r) => r.kind !== 'courtesy'), ...p.rules.filter((r) => r.kind === 'courtesy')].filter((f) => !isUnavailable(f));
  const mv = u.minVisit;

  slides.push({
    key: 'cover',
    render: () => (
      <div className="st-cover">
        <div className="st-cover-art"><PlaceCover id={id} height={210} /></div>
        <div className="st-cover-text">
          <p className="st-kicker">{p.type[lang]}</p>
          <h1 className="st-huge">{p.name[lang]}</h1>
          <span className={`st-verdict ${vt.tone}`}>{vt[lang]}</span>
          <LiveAlert p={p} twists={s.twists} lang={lang} compact />
          <div className="st-facts">
            <span><Icon name="clock" size={15} /> <b>{w ? `${fmt(w.open)}–${fmt(w.close)}` : tr('Hours not on record', 'समय दर्ज नहीं')}</b></span>
            <span><Icon name="tag" size={15} /> <b>{price === null ? tr('Price not confirmed', 'कीमत पक्की नहीं') : price === undefined ? tr('No fee on record', 'शुल्क दर्ज नहीं') : money(price, lang)}</b></span>
            {mv.v && <span><Icon name="history" size={15} /> <b>{mv.v}{mv.rec && mv.rec !== mv.v ? `–${mv.rec}` : ''} min</b></span>}
            {leg && <span><Icon name="route" size={15} /> <b>≈ {leg.minutes} min {MODE[leg.mode]}</b></span>}
          </div>
          <p className="st-hint">{tr('Tap for the details', 'पूरी बात के लिए टैप करें')} →</p>
        </div>
      </div>
    ),
  });

  // Everything to sort out before leaving, on one card: rules of the place, what is not certain, the rules people trip on.
  const alerted = p.units.some((x) => s.twists.closed.includes(x.id) || (s.twists.crowded ?? []).includes(x.id));
  if (alerted || p.sensitive || confirm.length || mustKnow.length) {
    slides.push({
      key: 'before',
      render: () => (
        <div className="st-body">
          <p className="st-kicker">{tr('Before you go', 'जाने से पहले')}</p>
          <LiveAlert p={p} twists={s.twists} lang={lang} />
          {p.sensitive && (
            <div className="st-tile">
              <b><Icon name="shield" size={16} /> {p.sensitive.kind === 'worship' ? tr('A place of worship', 'पूजा स्थल') : p.sensitive.kind === 'contested' ? tr('A sensitive site', 'संवेदनशील स्थल') : tr('People live here', 'यहाँ लोग रहते हैं')}</b>
              <p>{tr('Dress', 'पहनावा')}: {isUnavailable(p.sensitive.dress) ? p.sensitive.dress.why?.[lang] : tx(p.sensitive.dress, lang)}</p>
              {p.sensitive.worship && <p>{tr('Worship timings', 'पूजा का समय')}: {isUnavailable(p.sensitive.worship) ? p.sensitive.worship.why?.[lang] : tx(p.sensitive.worship, lang)}</p>}
            </div>
          )}
          {confirm.length > 0 && <ConfirmWhat c={check} data={data} p={p} u={u} lang={lang} />}
          {mustKnow.slice(0, 3).map((f, j) => (
            <div key={j} className="st-tile">
              <p>{tx(f, lang)}</p>
              <Sure f={f} lang={lang} />
            </div>
          ))}
        </div>
      ),
    });
  }

  slides.push({
    key: 'when',
    render: () => (
      <div className="st-body">
        <p className="st-kicker">{tr('When to go', 'कब जाएँ')}</p>
        <h2 className={`st-big ${vt.tone}`}>{vt[lang]}</h2>
        <p className="st-small">{tr('Decided by rules from the record, not by AI.', 'रिकॉर्ड के नियमों से तय, AI से नहीं।')}</p>
        <div className="st-grid">
          <div className="st-tile">
            <b><Icon name="clock" size={16} /> {tr('Open', 'खुलने का समय')}</b>
            <p>{isUnavailable(u.hours) ? tr('Not known yet', 'अभी पता नहीं') : u.hours.s === 'conflicting' ? tr('Not confirmed, sources disagree', 'पक्का नहीं, स्रोत अलग-अलग') : tx(u.hours, lang)}</p>
            <Sure f={u.hours} lang={lang} />
          </div>
          <div className="st-tile">
            <b><Icon name="history" size={16} /> {tr('Weekly closing', 'साप्ताहिक बंदी')}</b>
            <p>{isUnavailable(u.weeklyClosed) ? tr('Not known yet', 'अभी पता नहीं') : u.weeklyClosed.s === 'conflicting' ? tr('Not confirmed, sources disagree', 'पक्का नहीं, स्रोत अलग-अलग') : tx(u.weeklyClosed, lang)}</p>
            <Sure f={u.weeklyClosed} lang={lang} />
          </div>
          <div className="st-tile">
            <b><Icon name="tag" size={16} /> {tr('Last entry', 'आख़िरी प्रवेश')}</b>
            <p>{isUnavailable(u.lastEntry) ? tr('Not published', 'प्रकाशित नहीं') : tx(u.lastEntry, lang)}</p>
          </div>
          <div className="st-tile">
            <b><Icon name="clock" size={16} /> {tr('Keep', 'कितना समय रखें')}</b>
            <p>{mv.v ? `${mv.v}${mv.rec && mv.rec !== mv.v ? `–${mv.rec}` : ''} min` : tr('Not known yet', 'अभी पता नहीं')}</p>
            <Sure f={mv} lang={lang} />
          </div>
        </div>
        {u.hours.s === 'conflicting' && u.hours.why && <p className="st-warn">{u.hours.why[lang]}</p>}
      </div>
    ),
  });

  const rows = u.fees.v?.rows ?? [];
  slides.push({
    key: 'tickets',
    render: () => (
      <div className="st-body">
        <p className="st-kicker">{tr('Tickets and paying', 'टिकट और भुगतान')}</p>
        {u.fees.s === 'conflicting' ? (
          <>
            <h2 className="st-big">{tr('Price not confirmed', 'कीमत पक्की नहीं')}</h2>
            <p className="st-warn">{u.fees.why?.[lang]}</p>
          </>
        ) : isUnavailable(u.fees) || !indian ? (
          <>
            <h2 className="st-big">{tr('No fee on record', 'शुल्क दर्ज नहीं')}</h2>
            <p className="st-small">{u.fees.why?.[lang] ?? ''}</p>
          </>
        ) : (
          <div className="st-tile">
            {rows.map((r, j) => (
              <p key={j} className="st-line"><span>{r.label[lang]}</span><b>{r.any !== undefined ? money(r.any, lang) : r.cash === r.online || r.online === undefined ? money(r.cash, lang) : `${money(r.cash, lang)} ${tr('cash', 'नकद')} · ${money(r.online, lang)} ${tr('online', 'ऑनलाइन')}`}</b></p>
            ))}
            <Sure f={u.fees} lang={lang} />
          </div>
        )}
        {!isUnavailable(u.payment) && (
          <div className="st-tile">
            <b><Icon name="wallet" size={16} /> {tr('Paying', 'भुगतान')}</b>
            <p>{tx(u.payment, lang)}</p>
          </div>
        )}
        {!isUnavailable(u.custodian) && (
          <div className="st-tile">
            <b><Icon name="shield" size={16} /> {tr('Tickets sold by', 'टिकट देने वाले')}</b>
            <p>{tx(u.custodian, lang)}</p>
          </div>
        )}
        {p.units.length > 1 && <p className="st-small">{tr(`${p.units.length} sections here, each with its own ticket. Full details list them all.`, `यहाँ ${p.units.length} हिस्से हैं, हर एक का अलग टिकट। पूरी जानकारी में सब हैं।`)}</p>}
      </div>
    ),
  });

  if (leg && from) {
    slides.push({
      key: 'getting',
      render: () => (
        <div className="st-body">
          <p className="st-kicker">{tr('Getting there', 'कैसे पहुँचें')}</p>
          <div className="st-tile">
            <b><Icon name="route" size={16} /> {tr('From', 'से')} {startName(data, from)[lang]}</b>
            <p className="st-mid">≈ {leg.minutes} min {MODE[leg.mode]} · {leg.km.toFixed(1)} km</p>
            <p>{leg.fare?.max ? `₹${leg.fare.min}–${leg.fare.max} ${tr('fare band', 'किराया')}` : tr('Fare not known', 'किराया पता नहीं')} · {tr('estimate', 'अनुमान')}</p>
            <small className="st-small">{tr('Straight-line distance × 1.5 at a set speed, plus a buffer in your roadmap.', 'सीधी दूरी × 1.5, तय रफ़्तार पर। रोडमैप में अतिरिक्त समय जुड़ता है।')}</small>
          </div>
          {near.length > 0 && (
            <div className="st-tile">
              <b><Icon name="map" size={16} /> {tr('Close by', 'पास में')}</b>
              {near.map(({ q, km }) => (
                <p key={q.id} className="st-line"><span>{q.name[lang]}</span><b>{km.toFixed(1)} km</b></p>
              ))}
            </div>
          )}
        </div>
      ),
    });
  }

  const notes = [p.summary, ...p.notes].filter((f) => f && !isUnavailable(f));
  const acts = (p.activities ?? []).filter((x) => !isUnavailable(x));
  if (notes.length || acts.length) {
    slides.push({
      key: 'about',
      render: () => (
        <div className="st-body">
          <p className="st-kicker">{tr('What is there', 'वहाँ क्या है')}</p>
          {notes.slice(0, 2).map((f, j) => (
            <div key={j} className="st-tile">
              <p>{tx(f, lang)}</p>
              <Sure f={f} lang={lang} />
            </div>
          ))}
          {acts.length > 0 && (
            <div className="st-tile">
              <b><Icon name="sparkle" size={16} /> {tr('Things to do', 'क्या करें')}</b>
              {acts.slice(0, 4).map((x) => (
                <p key={x.id} className="st-line"><span>{x.name[lang]}</span>{x.price !== undefined && x.price !== null && <b>{money(x.price, lang)}</b>}</p>
              ))}
            </div>
          )}
        </div>
      ),
    });
  }

  slides.push({
    key: 'sure',
    render: () => (
      <div className="st-body">
        <p className="st-kicker">{tr('How sure we are', 'हम कितने पक्के हैं')}</p>
        <div className="st-tile">
          <b><Icon name="verify" size={16} /> {tr(`${sources.length} sources, checked by Team Argus`, `${sources.length} स्रोत, टीम आर्गस ने जाँचे`)}</b>
          {sources.slice(0, 4).map((src) => (
            <p key={src} className="st-src">{sourceName(data, { src } as Fact)}</p>
          ))}
        </div>
        {unknown.length > 0 && (
          <div className="st-tile">
            <b>{tr('Not on record yet. We never guess these.', 'अभी दर्ज नहीं। इनका अंदाज़ा नहीं लगाते।')}</b>
            <div className="st-qs">
              {unknown.map((x) => <span key={x} className="st-q">? {x}</span>)}
            </div>
          </div>
        )}
        {posts.length > 0 && (
          <div className="st-row">
            {[...new Map(posts.map((x) => [x.by, x.byName])).entries()].map(([by, name]) => (
              <button key={by} className="st-person" onClick={(e) => { e.stopPropagation(); open({ kind: 'saarthi', id: by }); }}>
                <Avatar id="peacock" size={40} />
                <small>{name}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    ),
  });

  slides.push({
    key: 'go',
    render: () => (
      <div className="st-body st-end">
        <div className="st-stamp"><StampArt place={p} got={!!s.stamps[id]} rarity={rarity} size={120} /></div>
        <h2 className="st-big">{p.name[lang]}</h2>
        <div className="st-actions" onClick={(e) => e.stopPropagation()}>
          <button className="st-btn primary" onClick={() => !plan?.stops.some((x) => x.place.id === id) && set((c) => ({ added: c.added.includes(id) ? c.added : [...c.added, id], removed: (c.removed ?? []).filter((x) => !p.units.some((q) => q.id === x)), quick: c.quick ?? { hours: 6, startPoint: 'station', start: '09:00' }, order: null }))}>
            <Icon name={inPlan ? 'check' : 'plus'} size={18} /> {inPlan ? tr('In your roadmap', 'रोडमैप में है') : tr('Add to roadmap', 'रोडमैप में जोड़ें')}
          </button>
          <button className="st-btn" onClick={gate(() => open({ kind: 'stamp', id }))}><Icon name="stamp" size={18} /> {s.stamps[id] ? tr('Stamp collected', 'स्टैम्प मिला') : tr('Collect stamp', 'स्टैम्प लें')}</button>
          <button className="st-btn" onClick={() => { set({ mapFocus: id }); closeAll(); go('map'); }}><Icon name="map" size={18} /> {tr('Show on map', 'नक्शे पर देखें')}</button>
          <button className="st-btn" onClick={() => replace({ kind: 'place', id })}><Icon name="form" size={18} /> {tr('See full details', 'पूरी जानकारी')}</button>
        </div>
      </div>
    ),
  });

  const [i, setI] = useState(0);
  const n = slides.length;
  const next = useCallback(() => setI((x) => Math.min(n - 1, x + 1)), [n]);
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') back();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [next, prev, back]);

  const tap = (e: React.MouseEvent) => {
    const x = e.clientX / (e.currentTarget as HTMLElement).clientWidth;
    if (x < 0.3) prev();
    else next();
  };

  return (
    <motion.div
      className="story"
      style={{ ['--s1' as string]: a.sky[0], ['--s2' as string]: a.sky[1], ['--sink' as string]: a.ink, ['--sacc' as string]: a.accent }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      role="dialog"
      aria-label={p.name[lang]}
    >
      <div className="st-bars" aria-hidden="true">
        {slides.map((sl, j) => (
          <span key={sl.key} className="st-bar"><motion.i initial={false} animate={{ width: j <= i ? '100%' : '0%' }} transition={{ duration: 0.3 }} /></span>
        ))}
      </div>
      <div className="st-top">
        <span className="st-mini"><PlaceCover id={id} height={30} /></span>
        <b>{p.name[lang]}</b>
        <span className="st-count">{i + 1}/{n}</span>
        <button className="st-close" onClick={back} aria-label={tr('Close', 'बंद करें')}><Icon name="x" size={20} /></button>
      </div>
      <motion.div
        className="st-stage"
        tabIndex={0}
        role="region"
        aria-label={`${p.name[lang]}, ${i + 1}/${n}`}
        onClick={tap}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.25}
        onDragEnd={(_, info) => (info.offset.x < -60 ? next() : info.offset.x > 60 ? prev() : undefined)}
      >
        <AnimatePresence mode="wait">
          <motion.div key={slides[i].key} className="st-slide" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}>
            {slides[i].render()}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
