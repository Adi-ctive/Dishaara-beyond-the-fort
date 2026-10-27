import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { CITY_IDS, SEEDS } from '../../core';
import { rarityOf } from '../../art/Stamp';
import { BADGES } from '../../data/demo';
import { useNav } from '../../nav';
import { promptFrom, useStore, type Role } from '../../store';
import { THEMES, isUnlocked, unlockHint } from '../../theme/themes';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../ui/Icon';
import { LayerPage, Section, Seg, Toggle } from '../../ui/Layer';
import { tierOf } from './Stamps';
import { AVATARS, Avatar, BANNERS, Banner, FRAMES, isOpen, unlockText } from '../../art/Avatars';
import { Medal } from '../../art/Medal';
import { SignInCard } from '../../ui/SignIn';
import { api, apiOn, lastError } from '../../api';

export function useProgress() {
  const { s, data } = useStore();
  const stamps = Object.values(s.stamps).filter((x) => x.status === 'confirmed');
  const counted = data.places.filter((p) => rarityOf(p) !== 'plain');
  const got = counted.filter((p) => s.stamps[p.id]?.status === 'confirmed').length;
  const tier = tierOf(got, counted.length);
  const tiers = tier === 'gold' ? ['Gwalior:gold', 'Gwalior:silver', 'Gwalior:bronze'] : tier === 'silver' ? ['Gwalior:silver', 'Gwalior:bronze'] : tier ? ['Gwalior:bronze'] : [];
  // Which city each collected stamp is in, and whether it was after 7 PM (IST).
  const ids = Object.entries(s.stamps).filter(([, x]) => x.status === 'confirmed');
  const inCity = (c: string) => ids.filter(([id]) => SEEDS[c as keyof typeof SEEDS].places.some((p) => p.id === id)).length;
  const istHour = (at: string) => Math.floor(((Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16)) + 330) % 1440) / 60);
  const have: Record<string, number> = {
    indore: inCity('indore'),
    cities: CITY_IDS.filter((c) => inCity(c) > 0).length,
    night: ids.filter(([, x]) => istHour(x.at) >= 19).length,
    stamps: stamps.length,
    rare: stamps.filter((x) => x.rare).length,
    quiet: stamps.filter((x) => x.quiet).length,
    feedback: s.feedback,
    food: s.food,
  };
  const badges = BADGES.filter((b) => (have[b.kind] ?? 0) >= b.need).map((b) => b.id);
  // Who is looking: role items need the role; partners get every general item (they are not here for the game).
  const ctx = { roles: s.user?.roles ?? [], work: s.saarthiApproved };
  return { have, tiers, got, total: counted.length, badges, ctx };
}

// R12: profile. Level, points, passport, quests, rewards, badges, personalisation, history, settings.
export function ProfileTab() {
  const { s, level } = useStore();
  const { lang, theme } = useTheme();
  const { open } = useNav();
  const { have } = useProgress();
  const hi = lang === 'hi';
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    if (apiOn() && s.signedIn) api.progress().then((p) => p && setStreak(p.streak ?? 0));
  }, [s.signedIn, s.points]);
  // Passport count per city, from the stamps on this phone.
  const passport = CITY_IDS.map((c) => {
    const counted = SEEDS[c].places.filter((p) => rarityOf(p) !== 'plain');
    return `${SEEDS[c].city.name[lang]} ${counted.filter((p) => s.stamps[p.id]?.status === 'confirmed').length} / ${counted.length}`;
  }).join(' · ');
  // The next thing a level unlocks: a theme, avatar, frame or banner.
  const nextUnlock = [
    ...THEMES.filter((t) => t.unlock.kind === 'level').map((t) => ({ level: (t.unlock as { level: number }).level, name: t.name[lang] })),
    ...[...AVATARS, ...FRAMES, ...BANNERS].filter((x) => x.unlock.level).map((x) => ({ level: x.unlock.level as number, name: x[lang] })),
  ].filter((x) => x.level > level).sort((a, b) => a.level - b.level)[0];
  // Guests get trip planning only: preferences and settings, plus a sign-in card for the rest.
  if (!s.signedIn) {
    const guestRows = [
      { icon: 'edit', title: hi ? 'मेरी पसंद' : 'My personalisation', sub: hi ? 'प्लानिंग के लिए' : 'Used to plan your day', go: () => open({ kind: 'prompt' }) },
      { icon: 'settings', title: hi ? 'सेटिंग्स' : 'Settings', sub: hi ? 'भाषा, आवाज़, रूप' : 'Language, voice, appearance', go: () => open({ kind: 'settings' }) },
    ];
    return (
      <div className="screen">
        <h1 className="display small">{hi ? 'राही (मेहमान)' : 'Raahi (guest)'}</h1>
        <SignInCard />
        <div className="locked-preview" aria-hidden="true">
          {BADGES.slice(0, 4).map((b) => <span key={b.id} className="medal"><Medal id={b.id} earned={false} size={40} /><small>{b[lang]}</small></span>)}
        </div>
        <p className="small muted center-text">{hi ? 'पासपोर्ट, स्टैम्प, बैज, लेवल और अवतार साइन इन के बाद।' : 'Passport, stamps, badges, levels and avatars unlock after sign-in.'}</p>
        {guestRows.map((r) => (
          <button key={r.title} className="card row" onClick={r.go}>
            <Icon name={r.icon} size={22} />
            <span className="grow"><b>{r.title}</b><small>{r.sub}</small></span>
            <Icon name="arrow" size={16} />
          </button>
        ))}
      </div>
    );
  }
  const rows: { icon: string; title: string; sub: string; go: () => void }[] = [
    { icon: 'stamp', title: hi ? 'पासपोर्ट' : 'Passport', sub: passport, go: () => open({ kind: 'passport' }) },
    { icon: 'trophy', title: hi ? 'लीडरबोर्ड' : 'Leaderboard', sub: hi ? 'इस हफ़्ते के सबसे सक्रिय राही' : 'Top raahis this week', go: () => open({ kind: 'leaders' }) },
    { icon: 'flag', title: hi ? 'क्वेस्ट' : 'Quests', sub: hi ? 'छोटे स्थानीय काम' : 'Short local side quests', go: () => open({ kind: 'quests' }) },
    { icon: 'trophy', title: hi ? 'इनाम और अनलॉक' : 'Rewards and unlocks', sub: hi ? 'थीम, बैज, फ़्लेयर' : 'Themes, badges, flairs, banners', go: () => open({ kind: 'rewards' }) },
    { icon: 'edit', title: hi ? 'मेरी पसंद' : 'My personalisation', sub: s.prompt.length ? `${s.prompt.length} ${hi ? 'बातें' : 'lines'}` : hi ? 'अभी खाली' : 'Empty, starts at zero', go: () => open({ kind: 'prompt' }) },
    { icon: 'history', title: hi ? 'यात्रा इतिहास' : 'Travel history', sub: `${s.history.length} ${hi ? 'दिन' : 'days'}`, go: () => open({ kind: 'history' }) },
    { icon: 'palette', title: hi ? 'रूप' : 'Appearance', sub: theme.name[lang], go: () => open({ kind: 'settings' }) },
    { icon: 'settings', title: hi ? 'सेटिंग्स' : 'Settings', sub: hi ? 'भाषा, आवाज़, लोकेशन' : 'Language, voice, location, account', go: () => open({ kind: 'settings' }) },
  ];
  return (
    <div className="screen">
      <div className="hero">
        <Banner id={s.look.banner} height={128} />
        <button className="hero-edit" onClick={() => open({ kind: 'look' })} aria-label={hi ? 'रूप बदलें' : 'Customise'}>
          <Icon name="edit" size={16} /> {hi ? 'बदलें' : 'Customise'}
        </button>
        <div className="hero-row">
          <button className="hero-avatar" onClick={() => open({ kind: 'look' })} aria-label={hi ? 'अवतार बदलें' : 'Change avatar'}>
            <Avatar id={s.look.avatar} frame={s.look.frame} size={96} />
          </button>
          <div className="hero-text">
            <h1 className="display small">{s.user?.name ?? (hi ? 'राही' : 'Raahi')}</h1>
            <span className="level-pill">{hi ? 'लेवल' : 'Level'} {level}</span>
            {streak > 0 && <span className="streak-pill" title={hi ? 'लगातार दिन' : 'Days in a row'}>🔥 {streak} {hi ? 'दिन' : streak === 1 ? 'day' : 'days'}</span>}
          </div>
        </div>
        <div className="xp">
          <div className="xp-bar"><motion.span initial={{ width: 0 }} animate={{ width: `${s.points % 100}%` }} transition={{ duration: 1, ease: 'easeOut' }} /></div>
          <small className="muted">{s.points} {hi ? 'पॉइंट' : 'points'} · {100 - (s.points % 100)} {hi ? 'अगले लेवल तक' : 'to level'} {level + 1}</small>
          {nextUnlock && <small className="next-unlock">🔓 {hi ? `लेवल ${nextUnlock.level} पर खुलेगा: ${nextUnlock.name}` : `Level ${nextUnlock.level} unlocks ${nextUnlock.name}`}</small>}
        </div>
      </div>
      <div className="badge-row">
        {BADGES.map((b) => {
          const on = (have[b.kind] ?? 0) >= b.need;
          return (
            <button key={b.id} className={`medal${on ? ' on' : ''}`} title={b.rule} onClick={() => open({ kind: 'rewards' })}>
              <Medal id={b.id} earned={on} size={44} />
              <small>{b[lang]}</small>
            </button>
          );
        })}
      </div>
      {rows.map((r, i) => (
        <motion.button key={r.title} className="card row" onClick={r.go} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
          <Icon name={r.icon} size={22} />
          <span className="grow"><b>{r.title}</b><small>{r.sub}</small></span>
          <Icon name="arrow" size={16} />
        </motion.button>
      ))}
    </div>
  );
}

export function Quests() {
  const { s, set } = useStore();
  const { lang } = useTheme();
  const hi = lang === 'hi';
  // Progress comes from the server: it counts what this account really did and pays each quest once.
  const [qs, setQs] = useState<Awaited<ReturnType<typeof api.quests>>>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!apiOn() || !s.signedIn) return setLoading(false);
    api.quests().then((r) => {
      setQs(r);
      setLoading(false);
      const paid = (r ?? []).reduce((n, q) => n + q.paidNow, 0);
      if (paid) set((c) => ({ points: c.points + paid }));
    });
  }, [s.signedIn, set]);
  return (
    <LayerPage title={hi ? 'क्वेस्ट' : 'Quests'}>
      {loading && <p className="muted">{hi ? 'लोड हो रहा है' : 'Loading'}</p>}
      {!loading && !qs && <p className="muted">{hi ? 'क्वेस्ट अभी नहीं मिल सके। इंटरनेट जाँचें।' : 'Could not load quests. Check your connection.'}</p>}
      {(qs ?? []).map((q) => (
        <div key={q.id} className={`quest card${q.done ? ' done' : ''}`}>
          <div className="grow">
            <b>{hi ? q.hi : q.en}</b>
            <div className="bar"><motion.span initial={{ width: 0 }} animate={{ width: `${(q.have / q.need) * 100}%` }} /></div>
            <small className="muted">{q.have} / {q.need}</small>
          </div>
          <span className="pts">+{q.pts}</span>
        </div>
      ))}
    </LayerPage>
  );
}

export function Rewards() {
  const { level } = useStore();
  const { open } = useNav();
  const { lang, setTheme } = useTheme();
  const { have, tiers, ctx } = useProgress();
  const hi = lang === 'hi';
  return (
    <LayerPage title={hi ? 'इनाम' : 'Rewards'}>
      <Section title={hi ? 'थीम' : 'Themes'}>
        <div className="theme-grid">
          {THEMES.map((t) => {
            const on = isUnlocked(t, level, tiers, ctx.roles);
            return (
              <button key={t.id} className={`theme-tile${on ? '' : ' locked'}`} style={{ background: t.light.bg, color: t.light.ink, borderColor: t.light.line }} onClick={(e) => on && setTheme(t.id, { x: e.clientX, y: e.clientY })}>
                <span className="theme-name">{t.name[lang]}</span>
                <span className="theme-hint" style={{ color: t.light.muted }}>{on ? (hi ? 'खुला' : 'Unlocked') : <><Icon name="lock" size={12} /> {unlockHint(t, lang)}</>}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title={hi ? 'बैज' : 'Badges'}>
        <div className="medal-grid">
          {BADGES.map((b) => {
            const n = Math.min(have[b.kind] ?? 0, b.need);
            const on = n >= b.need;
            return (
              <div key={b.id} className={`medal-card${on ? ' on' : ''}`}>
                <Medal id={b.id} earned={on} size={58} />
                <b>{b[lang]}</b>
                <small className="muted">{b.rule}</small>
                <div className="bar"><motion.span initial={{ width: 0 }} animate={{ width: `${(n / b.need) * 100}%` }} /></div>
              </div>
            );
          })}
        </div>
      </Section>
      <Section title={hi ? 'अवतार, फ़्रेम, बैनर' : 'Avatars, frames, banners'}>
        <button className="card row" onClick={() => open({ kind: 'look' })}><Icon name="user" size={22} /><span className="grow"><b>{hi ? 'अपना रूप बदलें' : 'Customise your profile'}</b><small>{hi ? 'लेवल और बैज से नए खुलते हैं' : 'New ones unlock with levels and badges'}</small></span><Icon name="arrow" size={16} /></button>
      </Section>
      <Section title={hi ? 'जल्द' : 'Later'} note={hi ? 'फ़ंडिंग के बाद' : 'Needs funding'}>
        <p className="muted small">{hi ? 'पॉइंट से उपहार, साथी दुकानों से।' : 'Points redeemed for gifts from partners. Flairs, banners and stamp ink colours unlock by level.'}</p>
      </Section>
    </LayerPage>
  );
}

// R13: the personal prompt the chat model gets. Plain lines the raahi can edit.
export function PromptEditor() {
  const { s, set } = useStore();
  const { lang } = useTheme();
  const { open } = useNav();
  const hi = lang === 'hi';
  const [line, setLine] = useState('');
  return (
    <LayerPage title={hi ? 'मेरी पसंद' : 'My personalisation'}>
      <p className="muted small">{hi ? 'चैट इन्हीं बातों से आपके लिए जवाब बनाता है। आपकी फ़ीडबैक से ये बदलती हैं।' : 'The chat shapes answers from these lines. Your feedback updates them. Edit anything.'}</p>
      <ul className="prompt-list">
        {s.prompt.map((l, i) => (
          <motion.li key={l + i} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <span className="grow">{l}</span>
            <button className="icon-btn small" onClick={() => set((c) => ({ prompt: c.prompt.filter((_, j) => j !== i) }))} aria-label="Remove">
              <Icon name="x" size={16} />
            </button>
          </motion.li>
        ))}
        {!s.prompt.length && <li className="muted">{hi ? 'खाली: बिना पर्सनलाइज़ेशन के शुरू।' : 'Empty: the app starts at zero personalisation.'}</li>}
      </ul>
      <form className="row-actions" onSubmit={(e) => { e.preventDefault(); if (line.trim()) { set((c) => ({ prompt: [...c.prompt, line.trim()] })); setLine(''); } }}>
        <input value={line} onChange={(e) => setLine(e.target.value)} placeholder={hi ? 'जैसे: किले पसंद हैं' : 'For example: likes forts'} aria-label="New line" />
        <button className="btn primary" type="submit"><Icon name="plus" size={18} /></button>
      </form>
      <div className="row-actions">
        <button className="btn ghost" onClick={() => set((c) => ({ prompt: promptFrom(c.interests, c.prefs) }))}>{hi ? 'जवाबों से फिर बनाएँ' : 'Rebuild from my answers'}</button>
        <button className="btn ghost" onClick={() => open({ kind: 'onboarding' })}>{hi ? 'सवाल फिर से' : 'Answer the questions again'}</button>
      </div>
    </LayerPage>
  );
}

export function History() {
  const { data } = useStore();
  const { lang } = useTheme();
  const hi = lang === 'hi';
  // Saved day plans from the server, newest first. Places come from the plan's order and ticks.
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof api.myPlans>> | undefined>(undefined);
  useEffect(() => {
    api.myPlans().then(setPlans);
  }, []);
  const name = (id: string) => data.places.find((p) => p.id === id || p.units.some((u) => u.id === id))?.name[lang] ?? id;
  return (
    <LayerPage title={hi ? 'यात्रा इतिहास' : 'Travel history'}>
      {plans === undefined && <p className="muted">{hi ? 'लोड हो रहा है' : 'Loading'}</p>}
      {plans?.length === 0 && <p className="muted">{hi ? 'अभी कोई सहेजी यात्रा नहीं। दिन की योजना बनाएँ, वह यहाँ दिखेगी।' : 'No saved trips yet. Plan a day and it shows here.'}</p>}
      {plans?.map((h) => (
        <div key={h.id} className="card">
          <div className="grow">
            <b>{h.input?.date ?? h.at?.slice(0, 10)}</b>
            <small>{[...new Set([...(h.done ?? []), ...(h.order ?? [])])].map(name).join(', ') || (hi ? 'कोई जगह नहीं' : 'No places')}</small>
          </div>
        </div>
      ))}
    </LayerPage>
  );
}

export function Settings() {
  const { s, set } = useStore();
  const { lang, setLang, mode, toggleMode, theme } = useTheme();
  const { open, go } = useNav();
  const hi = lang === 'hi';
  // An account only switches to roles it holds (staff hold all of them). Guests are raahis only.
  const held = (r: Role) => r === 'raahi' || !!s.user?.roles.includes(r) || (r === 'business' && !!s.user?.roles.includes('moderator'));
  const asRole = (r: Role) => {
    if (r !== 'raahi' && !s.signedIn) return open({ kind: 'signin' });
    if (!held(r)) return open({ kind: 'apply' });
    set({ role: r });
    go(r === 'raahi' ? 'chat' : r === 'saarthi' ? 's-home' : r === 'business' ? 'b-home' : 'm-home');
  };
  const roleOpts = ([{ v: 'raahi', label: 'Raahi' }, { v: 'saarthi', label: 'Saarthi' }, { v: 'business', label: 'Business' }, { v: 'moderator', label: 'Moderator' }] as { v: Role; label: string }[]).filter((o) => held(o.v));
  const askLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(() => set((c) => ({ prefs: { ...c.prefs, location: true } })), () => set((c) => ({ prefs: { ...c.prefs, location: false } })));
  };
  return (
    <LayerPage title={hi ? 'सेटिंग्स' : 'Settings'}>
      <Section title={hi ? 'भाषा' : 'Language'}>
        <Seg value={lang} onChange={setLang} options={[{ v: 'en', label: 'English' }, { v: 'hi', label: 'हिन्दी' }]} />
      </Section>
      <Section title={hi ? 'रूप' : 'Appearance'}>
        <button className="card row" onClick={() => document.querySelector<HTMLButtonElement>('[data-theme-button]')?.click()}>
          <Icon name="palette" size={22} /><span className="grow"><b>{theme.name[lang]}</b><small>{hi ? 'थीम बदलें' : 'Change theme'}</small></span>
        </button>
        {theme.dark && <Toggle on={mode === 'dark'} onChange={() => toggleMode()} label={hi ? 'डार्क मोड' : 'Dark mode'} />}
      </Section>
      {/* The ElevenLabs free plan asks for this credit. */}
      <Section title={hi ? 'आवाज़' : 'Voice'} note={hi ? 'आवाज़: ElevenLabs. सर्वर बंद हो तो ब्राउज़र की आवाज़।' : 'Voice by ElevenLabs. Falls back to your browser voice when offline.'}>
        <Toggle on={s.prefs.autoVoice} onChange={(v) => set((c) => ({ prefs: { ...c.prefs, autoVoice: v } }))} label={hi ? 'जवाब पढ़कर सुनाएँ' : 'Read replies aloud'} />
      </Section>
      <Section title={hi ? 'लोकेशन' : 'Location'} note={hi ? 'सिर्फ़ स्टैम्प, देरी और सुरक्षा के लिए। यात्रा के बाद मिटा दी जाती है।' : 'Used only for stamps, running late and safety. Deleted after the trip.'}>
        <Toggle on={s.prefs.location} onChange={(v) => (v ? askLocation() : set((c) => ({ prefs: { ...c.prefs, location: false } })))} label={hi ? 'लोकेशन की अनुमति' : 'Allow location'} />
      </Section>
      <Section title={hi ? 'अकाउंट' : 'Account'}>
        {!s.signedIn ? (
          <button className="btn primary" onClick={() => open({ kind: 'signin', as: 'raahi' })}>{hi ? 'साइन इन' : 'Sign in'}</button>
        ) : (
          <button className="btn ghost" onClick={() => { set({ signedIn: false, user: null, role: 'raahi', stamps: {}, points: 0 }); api.signOut(); location.assign(location.pathname); }}>{hi ? 'साइन आउट' : 'Sign out'}</button>
        )}
        <button className="btn ghost" onClick={() => open({ kind: 'apply' })}>{hi ? 'सारथी बनें' : 'Become a saarthi'}</button>
        <button className="btn ghost" onClick={() => open({ kind: 'apply-biz' })}>{hi ? 'अपनी दुकान जोड़ें' : 'List your shop'}</button>
      </Section>
      {roleOpts.length > 1 && <Section title={hi ? 'दिशारा को इस रूप में इस्तेमाल करें' : 'Use Dishaara as'} note={hi ? 'सिर्फ़ वे भूमिकाएँ जो आपके अकाउंट के पास हैं' : 'Only the roles your account holds'}>
        <Seg value={s.role} onChange={asRole} options={roleOpts} />
      </Section>}
    </LayerPage>
  );
}

export function Feedback({ id }: { id: string }) {
  const { data, set } = useStore();
  const { lang } = useTheme();
  const { back } = useNav();
  const hi = lang === 'hi';
  const p = data.places.find((x) => x.id === id)!;
  const [err, setErr] = useState('');
  const [a, setA] = useState({ open: '', fee: '', crowd: '', note: '' });
  const qs: { k: 'open' | 'fee' | 'crowd'; q: string; opts: string[] }[] = [
    { k: 'open', q: hi ? 'क्या यह खुला था?' : 'Was it open?', opts: [hi ? 'हाँ' : 'Yes', hi ? 'नहीं' : 'No', hi ? 'पता नहीं' : 'Not sure'] },
    { k: 'fee', q: hi ? 'टिकट हमारी जानकारी जैसी थी?' : 'Was the ticket price as shown?', opts: [hi ? 'हाँ' : 'Yes', hi ? 'अलग थी' : 'Different', hi ? 'टिकट नहीं लिया' : 'Did not buy'] },
    { k: 'crowd', q: hi ? 'भीड़ कैसी थी?' : 'How crowded was it?', opts: [hi ? 'शांत' : 'Quiet', hi ? 'ठीक' : 'Normal', hi ? 'बहुत' : 'Packed'] },
  ];
  const answered = qs.filter((q) => a[q.k]).length > 0 || a.note.trim().length > 0;
  const submit = () => {
    if (!answered) return;
    const text = [...qs.filter((q) => a[q.k]).map((q) => `${q.q} ${a[q.k]}`), ...(a.note.trim() ? [a.note.trim()] : [])].join(' · ');
    // Goes to the server as a ticket for this region's saarthis. Points only when the server accepts it.
    api.feedback({ placeId: id, answers: { open: a.open, fee: a.fee, crowd: a.crowd }, note: [text, a.note].filter(Boolean).join(' · ').slice(0, 500) }).then((r) => {
      if (!r) return setErr(lastError || (hi ? 'नहीं भेजा जा सका।' : 'Could not send.'));
      set((c) => ({ feedback: c.feedback + 1, points: c.points + r.points }));
      back();
    });
  };
  return (
    <LayerPage title={hi ? 'फ़ीडबैक' : 'Feedback'}>
      <p className="muted">{p.name[lang]}</p>
      {qs.map((q) => (
        <div key={q.k} className="field">
          <span>{q.q}</span>
          <div className="chips">
            {q.opts.map((o) => (
              <button key={o} className={`chip big${a[q.k] === o ? ' on' : ''}`} onClick={() => setA({ ...a, [q.k]: o })}>{o}</button>
            ))}
          </div>
        </div>
      ))}
      <label className="field">
        <span>{hi ? 'कुछ और ग़लत था?' : 'Anything else wrong?'}</span>
        <textarea value={a.note} onChange={(e) => setA({ ...a, note: e.target.value })} rows={3} />
      </label>
      {err && <p className="small error">{err}</p>}
      <button className="btn primary big" onClick={submit} aria-disabled={!answered} style={answered ? undefined : { opacity: 0.5 }}>{answered ? (hi ? 'भेजें · +15' : 'Send · +15 points') : hi ? 'पहले एक जवाब चुनें' : 'Pick at least one answer'}</button>
      <p className="small muted">{hi ? 'इस इलाके के सारथी इसे देखेंगे।' : "This region's saarthis see it and answer."}</p>
    </LayerPage>
  );
}

export function Apply() {
  const { lang } = useTheme();
  const hi = lang === 'hi';
  const [area, setArea] = useState('');
  const [who, setWho] = useState('guide');
  const [note, setNote] = useState('');
  const [res, setRes] = useState('');
  const send = () => {
    if (area.trim().length < 2) return setRes(hi ? 'शहर और इलाका लिखें।' : 'Write your city and area.');
    api.applySaarthi(area.trim(), `${who}. ${note.trim()}`).then((r) =>
      setRes(!r ? lastError : r.status === 'pending' ? (hi ? 'भेजा गया। मॉडरेटर जाँचेंगे।' : 'Sent. A moderator will check it.') : hi ? 'आप पहले से सारथी हैं।' : 'You are already a saarthi.'));
  };
  return (
    <LayerPage title={hi ? 'सारथी बनें' : 'Become a saarthi'}>
      <p className="muted">{hi ? 'स्थानीय गाइड, संरक्षक और जानकार निवासी। हम पहले आपकी पहचान और काम जाँचते हैं।' : 'Local guides, custodians and residents who know their area. We check who you are and your work first.'}</p>
      <ol className="steps-list">
        <li>{hi ? 'फ़ॉर्म भरें' : 'Fill the form'}</li>
        <li>{hi ? 'पहचान और लाइसेंस जाँच (जारी करने वाली संस्था से)' : 'ID and licence checked with the issuing body'}</li>
        <li>{hi ? 'मॉडरेटर के साथ पहला काम' : 'First task with a moderator'}</li>
        <li>{hi ? 'इलाका और मासिक काम मिलेगा' : 'Get a region and monthly tasks'}</li>
      </ol>
      <label className="field"><span>{hi ? 'शहर और इलाका' : 'City and area'}</span><input value={area} maxLength={80} onChange={(e) => setArea(e.target.value)} /></label>
      <div className="field"><span>{hi ? 'आप कौन हैं' : 'You are'}</span>
        <Seg value={who} onChange={setWho} options={[{ v: 'guide', label: hi ? 'गाइड' : 'Guide' }, { v: 'custodian', label: hi ? 'संरक्षक' : 'Custodian' }, { v: 'resident', label: hi ? 'निवासी' : 'Resident' }]} />
      </div>
      <label className="field"><span>{hi ? 'अपने बारे में (लाइसेंस नंबर, अनुभव)' : 'About you (licence number, experience)'}</span><textarea rows={3} maxLength={250} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <button className="btn primary big" onClick={send}>{hi ? 'आवेदन भेजें' : 'Send application'}</button>
      {res && <p className="small muted">{res}</p>}
    </LayerPage>
  );
}

// Customise: avatar, frame, banner. Locked items show what unlocks them.
export function Look() {
  const { s, set, level } = useStore();
  const { lang } = useTheme();
  const { badges, tiers, ctx } = useProgress();
  const hi = lang === 'hi';
  const [part, setPart] = useState<'avatar' | 'frame' | 'banner'>('avatar');
  const choose = (k: 'avatar' | 'frame' | 'banner', id: string) => set((c) => ({ look: { ...c.look, [k]: id } }));
  const list = part === 'avatar' ? AVATARS : part === 'frame' ? FRAMES : BANNERS;
  return (
    <LayerPage title={hi ? 'अपना रूप' : 'Your look'}>
      <div className="look-preview">
        <Banner id={s.look.banner} height={110} />
        <div className="look-avatar"><Avatar id={s.look.avatar} frame={s.look.frame} size={92} /></div>
      </div>
      <Seg value={part} onChange={setPart} options={[{ v: 'avatar', label: hi ? 'अवतार' : 'Avatar' }, { v: 'frame', label: hi ? 'फ़्रेम' : 'Frame' }, { v: 'banner', label: hi ? 'बैनर' : 'Banner' }]} />
      <div className={part === 'banner' ? 'look-grid wide' : 'look-grid'}>
        {list.map((it) => {
          const ok = isOpen(it.unlock, level, badges, tiers, ctx);
          const active = s.look[part] === it.id;
          return (
            <button key={it.id} className={`look-item${active ? ' active' : ''}${ok ? '' : ' locked'}`} onClick={() => ok && choose(part, it.id)} aria-pressed={active} aria-disabled={!ok}>
              {part === 'avatar' && <Avatar id={it.id} size={72} />}
              {part === 'frame' && <Avatar id={s.look.avatar} frame={it.id} size={72} />}
              {part === 'banner' && <Banner id={it.id} height={70} />}
              <b>{it[lang]}</b>
              <small>{ok ? (active ? (hi ? 'चुना हुआ' : 'In use') : hi ? 'खुला' : 'Unlocked') : <><Icon name="lock" size={11} /> {unlockText(it.unlock, lang)}</>}</small>
            </button>
          );
        })}
      </div>
    </LayerPage>
  );
}
