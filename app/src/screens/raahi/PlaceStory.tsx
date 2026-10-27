// A place as a set of story cards, like Spotify Wrapped or Instagram stories: one idea per card,
// big type, the place's own colours. Tap the right side or swipe left for the next card.
// Every card is built from the checked record; nothing here is written by hand per place.
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { checkUnit, isUnavailable, type Fact, type Place, type Unit } from '../../core';
import { Avatar } from '../../art/Avatars';
import { PlaceCover, artFor } from '../../art/PlaceCover';
import { StampArt, rarityOf } from '../../art/Stamp';
import { useLiveFeed } from '../Social';
import { useNav } from '../../nav';
import { useStore } from '../../store';
import { useTheme, type Lang } from '../../theme/ThemeProvider';
import { ConfirmWhat, LABEL_TEXT, VERDICT_TEXT, dateText, sourceName, tx } from '../../ui/facts';
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

  slides.push({
    key: 'cover',
    render: () => (
      <div className="st-cover">
        <div className="st-cover-art"><PlaceCover id={id} height={230} /></div>
        <div className="st-cover-text">
          <p className="st-kicker">{p.type[lang]}</p>
          <h1 className="st-huge">{p.name[lang]}</h1>
          <div className="st-row">
            <span className={`st-verdict ${vt.tone}`}>{vt[lang]}</span>
            {rarity === 'rare' && <span className="st-chip">★ {tr('Rare stamp', 'दुर्लभ स्टैम्प')}</span>}
          </div>
          <p className="st-hint">{tr('Tap to see the story', 'कहानी देखने के लिए टैप करें')} →</p>
        </div>
      </div>
    ),
  });

  if (p.sensitive) {
    slides.push({
      key: 'rules-first',
      render: () => (
        <div className="st-body">
          <p className="st-kicker">{tr('Before you go', 'जाने से पहले')}</p>
          <h2 className="st-big">
            {p.sensitive!.kind === 'worship'
              ? tr('A place of worship. Rules come first.', 'पूजा स्थल। पहले नियम।')
              : p.sensitive!.kind === 'contested'
                ? tr('A sensitive site. Rules come first.', 'संवेदनशील स्थल। पहले नियम।')
                : tr('People live here. Rules come first.', 'यहाँ लोग रहते हैं। पहले नियम।')}
          </h2>
          <div className="st-tile">
            <b>{tr('Dress', 'पहनावा')}</b>
            <p>{isUnavailable(p.sensitive!.dress) ? p.sensitive!.dress.why?.[lang] : tx(p.sensitive!.dress, lang)}</p>
          </div>
          {p.sensitive!.worship && (
            <div className="st-tile">
              <b>{tr('Worship timings', 'पूजा का समय')}</b>
              <p>{isUnavailable(p.sensitive!.worship) ? p.sensitive!.worship.why?.[lang] : tx(p.sensitive!.worship, lang)}</p>
            </div>
          )}
        </div>
      ),
    });
  }

  slides.push({
    key: 'today',
    render: () => (
      <div className="st-body">
        <p className="st-kicker">{tr('Can I go today?', 'आज जा सकते हैं?')}</p>
        <h2 className={`st-giant ${vt.tone}`}>{vt[lang]}</h2>
        <p className="st-small">{tr('Decided by rules from the record, not by AI.', 'रिकॉर्ड के नियमों से तय, AI से नहीं।')}</p>
        <ConfirmWhat c={check} data={data} p={p} u={u} lang={lang} />
        <div className="st-tile">
          <b><Icon name="clock" size={16} /> {tr('Open', 'खुलने का समय')}</b>
          <p className="st-mid">{isUnavailable(u.hours) ? tr('Not known yet', 'अभी पता नहीं') : u.hours.s === 'conflicting' ? tr('Not confirmed, sources disagree', 'पक्का नहीं, स्रोत अलग-अलग') : tx(u.hours, lang)}</p>
          <Sure f={u.hours} lang={lang} />
        </div>
        <div className="st-tile">
          <b><Icon name="history" size={16} /> {tr('Weekly closing', 'साप्ताहिक बंदी')}</b>
          <p>{isUnavailable(u.weeklyClosed) ? tr('Not known yet', 'अभी पता नहीं') : u.weeklyClosed.s === 'conflicting' ? tr('Not confirmed, sources disagree', 'पक्का नहीं, स्रोत अलग-अलग') : tx(u.weeklyClosed, lang)}</p>
          <Sure f={u.weeklyClosed} lang={lang} />
        </div>
        {u.hours.s === 'conflicting' && u.hours.why && <p className="st-warn">{u.hours.why[lang]}</p>}
      </div>
    ),
  });

  const rows = u.fees.v?.rows ?? [];
  const indian = rows.find((r) => r.who === 'indian');
  slides.push({
    key: 'tickets',
    render: () => (
      <div className="st-body">
        <p className="st-kicker">{tr('Tickets', 'टिकट')}</p>
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
          <>
            <div className="st-price">
              <span className="st-giant">{money(indian.any ?? indian.cash, lang)}</span>
              <span className="st-small">{indian.any !== undefined ? indian.label[lang] : `${tr('cash', 'नकद')} · ${indian.label[lang]}`}</span>
            </div>
            {indian.any === undefined && indian.online !== undefined && (
              <p className="st-mid">{money(indian.online, lang)} {tr('if you pay online', 'ऑनलाइन देने पर')}</p>
            )}
            <div className="st-tile">
              {rows.filter((r) => r !== indian).map((r, i) => (
                <p key={i} className="st-line"><span>{r.label[lang]}</span><b>{r.any !== undefined ? money(r.any, lang) : r.cash === r.online ? money(r.cash, lang) : `${money(r.cash, lang)} ${tr('cash', 'नकद')} · ${money(r.online, lang)} ${tr('online', 'ऑनलाइन')}`}</b></p>
              ))}
              <Sure f={u.fees} lang={lang} />
            </div>
          </>
        )}
        {p.units.length > 1 && (
          <p className="st-small">{tr(`${p.units.length} sections here, each with its own ticket. Full details list them all.`, `यहाँ ${p.units.length} हिस्से हैं, हर एक का अलग टिकट। पूरी जानकारी में सब हैं।`)}</p>
        )}
      </div>
    ),
  });

  const mv = u.minVisit;
  slides.push({
    key: 'time',
    render: () => (
      <div className="st-body">
        <p className="st-kicker">{tr('How long to keep', 'कितना समय रखें')}</p>
        <h2 className="st-giant">{mv.v ? `${mv.v}${mv.rec && mv.rec !== mv.v ? `–${mv.rec}` : ''}` : '?'}<span className="st-unit"> min</span></h2>
        <Sure f={mv} lang={lang} />
        {!isUnavailable(u.payment) && (
          <div className="st-tile">
            <b><Icon name="wallet" size={16} /> {tr('Paying', 'भुगतान')}</b>
            <p>{tx(u.payment, lang)}</p>
          </div>
        )}
        {!isUnavailable(u.custodian) && (
          <div className="st-tile">
            <b><Icon name="shield" size={16} /> {tr('Looked after by', 'देखरेख')}</b>
            <p>{tx(u.custodian, lang)}</p>
          </div>
        )}
      </div>
    ),
  });

  const notes = [p.summary, ...p.rules, ...p.notes].filter((f) => f && !isUnavailable(f));
  if (notes.length) {
    slides.push({
      key: 'know',
      render: () => (
        <div className="st-body">
          <p className="st-kicker">{tr('Good to know', 'जानने लायक')}</p>
          {notes.slice(0, 4).map((f, i) => (
            <motion.div key={i} className="st-tile" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}>
              <p>{tx(f, lang)}</p>
              <Sure f={f} lang={lang} />
            </motion.div>
          ))}
        </div>
      ),
    });
  }

  slides.push({
    key: 'unknown',
    render: () => (
      <div className="st-body">
        <p className="st-kicker">{tr('What we don’t know', 'हमें क्या नहीं पता')}</p>
        <h2 className="st-big">{unknown.length ? tr('We never guess these.', 'इनका हम अंदाज़ा नहीं लगाते।') : tr('Everything on our list is on record.', 'हमारी सूची की हर बात दर्ज है।')}</h2>
        <div className="st-qs">
          {unknown.map((x, i) => (
            <motion.span key={x} className="st-q" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.06 }}>? {x}</motion.span>
          ))}
        </div>
        {unknown.length > 0 && <p className="st-small">{tr('Saarthis are filling these in. Ask at the site.', 'सारथी इन्हें भर रहे हैं। जगह पर पूछें।')}</p>}
      </div>
    ),
  });

  slides.push({
    key: 'who',
    render: () => (
      <div className="st-body">
        <p className="st-kicker">{tr('Who checked this', 'किसने जाँचा')}</p>
        <h2 className="st-big">{tr(`${sources.length} sources, checked by Team Argus`, `${sources.length} स्रोत, टीम आर्गस ने जाँचे`)}</h2>
        <div className="st-tile">
          {sources.slice(0, 4).map((src) => (
            <p key={src} className="st-src"><Icon name="verify" size={14} /> {sourceName(data, { src } as Fact)}</p>
          ))}
        </div>
        {posts.length > 0 && (
          <>
            <p className="st-kicker">{tr('Saarthis posting about it', 'इसके बारे में सारथी')}</p>
            <div className="st-row">
              {[...new Map(posts.map((x) => [x.by, x.byName])).entries()].map(([by, name]) => (
                <button key={by} className="st-person" onClick={(e) => { e.stopPropagation(); open({ kind: 'saarthi', id: by }); }}>
                  <Avatar id="peacock" size={44} />
                  <small>{name}</small>
                </button>
              ))}
            </div>
          </>
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
          <button className="st-btn primary" onClick={() => !plan?.stops.some((x) => x.place.id === id) && set((c) => ({ added: c.added.includes(id) ? c.added : [...c.added, id], quick: c.quick ?? { hours: 6, startPoint: 'station', start: '09:00' }, order: null }))}>
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
