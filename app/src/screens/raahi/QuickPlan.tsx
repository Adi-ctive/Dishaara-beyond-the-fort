import { lazy, Suspense, useState } from 'react';
import { cityNear, eventsOn, pointStart, startCoord, startName, type Mode } from '../../core';
import { INTERESTS } from '../../data/demo';
import { useNav } from '../../nav';
import { nowMinIST, promptFrom, useStore, type Prefs } from '../../store';
import { useTheme } from '../../theme/ThemeProvider';
import { EventNote } from '../../ui/EventNote';
import { Icon } from '../../ui/Icon';
import { LayerPage, Toggle } from '../../ui/Layer';
import { Chips, Counter } from '../../ui/Pickers';

const MapPicker = lazy(() => import('../../map/MapPicker').then((m) => ({ default: m.MapPicker })));

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** The raahi's chosen start, or the next quarter hour when they said "now". */
export function startFor(at: Prefs['startAt']): string {
  return at === 'early' ? '08:00' : at === 'mid' ? '10:00' : at === 'after' ? '14:00' : roundedStart();
}

export function roundedStart(): string {
  const n = nowMinIST();
  const m = Math.ceil(n / 15) * 15;
  if (m < 9 * 60 || m > 17 * 60) return '09:00';
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

type Who = Prefs['who'];
// Group sizes each choice starts from; "Adjust" changes them.
const GROUP: Record<Who, Prefs['group']> = {
  solo: { indian: 1, foreign: 0, child: 0 },
  couple: { indian: 2, foreign: 0, child: 0 },
  family: { indian: 2, foreign: 0, child: 1 },
  friends: { indian: 3, foreign: 0, child: 0 },
};

// "Plan my day": time, start point, who is coming, mood. Trip details change every time, so they are
// asked here (filled from the last trip), not in the one-time setup. The roadmap appears at once.
export function QuickPlan({ hours: asked }: { hours?: number }) {
  const { s, set, data, today } = useStore();
  const { lang } = useTheme();
  const { closeAll, go } = useNav();
  const hi = lang === 'hi';
  const t = (en: string, hin: string) => (hi ? hin : en);
  const [hours, setHours] = useState(asked ?? s.quick?.hours ?? 4);
  const [startPoint, setStart] = useState(s.quick?.startPoint ?? 'station');
  const [startTime, setStartTime] = useState(() => startFor(s.prefs.startAt));
  // Plan ahead: any day in the next six months. Past or missing means today.
  const [date, setDate] = useState(() => (s.quick?.date && s.quick.date > today ? s.quick.date : today));
  const plusDays = (n: number) => new Date(Date.parse(today + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const tomorrow = plusDays(1);
  const onDay = eventsOn(data, date);
  const dayLabel = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const [picking, setPicking] = useState(false);
  const [where, setWhere] = useState('');
  const { tokens } = useTheme();
  // Location: use it when it is inside the city on screen.
  const useMe = () => {
    if (!navigator.geolocation) return setWhere(t('This browser cannot share location.', 'यह ब्राउज़र लोकेशन नहीं दे सकता।'));
    setWhere(t('Finding you…', 'आपको ढूँढ रहे हैं…'));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c: [number, number] = [p.coords.latitude, p.coords.longitude];
        if (cityNear(c[0], c[1]) !== s.city) return setWhere(t(`You seem to be outside ${data.city.name.en}. Pick a start on the map instead.`, `आप ${data.city.name.hi} से बाहर लगते हैं। नक्शे पर शुरुआत चुनें।`));
        setStart(pointStart(c, 'me'));
        setWhere('');
      },
      () => setWhere(t('Location is off. Allow it in the browser, or drop a pin on the map.', 'लोकेशन बंद है। ब्राउज़र में अनुमति दें, या नक्शे पर पिन लगाएँ।')),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const [picked, setPicked] = useState<string[]>(s.interests);
  const [trip, setTrip] = useState({ who: s.prefs.who, group: s.prefs.group, elders: s.prefs.elders, modes: s.prefs.modes, startAt: s.prefs.startAt, night: s.prefs.night });
  const [adjust, setAdjust] = useState(false);
  const put = (patch: Partial<typeof trip>) => setTrip((x) => ({ ...x, ...patch }));
  const g = trip.group;
  const start = startTime;
  const people = g.indian + g.foreign + g.child;

  const make = () => {
    const prefs: Prefs = { ...s.prefs, ...trip, modes: trip.modes.length ? trip.modes : ['walk', 'auto'] };
    set({ quick: { hours, startPoint, start, date: date === today ? undefined : date }, prefs, prompt: promptFrom(picked, prefs), order: null, done: [], skip: [], interests: picked });
    closeAll();
    go('roadmap');
  };

  return (
    <LayerPage title={t('Plan your day', 'अपना दिन प्लान करें')}>
      <div className="tap-step">
        <span className="tap-n">1</span>
        <b>{t('When, and for how long?', 'कब, और कितनी देर?')}</b>
        <div className="chips" role="group" aria-label={t('Day', 'दिन')}>
          <button className={`chip${date === today ? ' on' : ''}`} onClick={() => setDate(today)}>{t('Today', 'आज')}</button>
          <button className={`chip${date === tomorrow ? ' on' : ''}`} onClick={() => setDate(tomorrow)}>{t('Tomorrow', 'कल')}</button>
          <label className={`chip date-chip${date > tomorrow ? ' on' : ''}`}>
            <Icon name="calendar" size={14} /> {date > tomorrow ? dayLabel(date) : t('Pick a date', 'तारीख़ चुनें')}
            <input type="date" min={today} max={plusDays(183)} value={date} onChange={(e) => e.target.value && setDate(e.target.value < today ? today : e.target.value)} aria-label={t('Date of your visit', 'घूमने की तारीख़')} />
          </label>
        </div>
        <EventNote events={onDay} />
        <label className="slider">
          <span>{t('Start at', 'शुरुआत')} <b>{startTime}</b></span>
          <input type="range" min={360} max={1200} step={15} value={toMin(startTime)} onChange={(e) => setStartTime(toHM(Number(e.target.value)))} aria-label={t('Start time', 'शुरू होने का समय')} />
        </label>
        {date === today && <button className="link small" onClick={() => setStartTime(roundedStart())}>{t('Start now', 'अभी शुरू करें')} · {roundedStart()}</button>}
        <label className="slider">
          <span>{t('For', 'कुल')} <b>{hours} {t(hours === 1 ? 'hour' : 'hours', 'घंटे')}</b> · {t('until', 'तक')} {toHM(Math.min(toMin(startTime) + hours * 60, 23 * 60 + 45))}</span>
          <input type="range" min={1} max={12} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label={t('Hours', 'घंटे')} />
        </label>
      </div>
      <div className="tap-step">
        <span className="tap-n">2</span>
        <b>{t('Where do you start?', 'कहाँ से शुरू?')}</b>
        <div className="chips">
          <button className={`chip big${startPoint.endsWith(':me') ? ' on' : ''}`} onClick={useMe}><Icon name="pin" size={16} /> {t('My location', 'मेरी लोकेशन')}</button>
          <button className={`chip big${startPoint.endsWith(':pin') || picking ? ' on' : ''}`} onClick={() => setPicking((x) => !x)}><Icon name="map" size={16} /> {t('Pick on map', 'नक्शे पर चुनें')}</button>
          {data.landmarks.map((l) => (
            <button key={l.id} className={`chip big${startPoint === l.id ? ' on' : ''}`} onClick={() => { setStart(l.id); setPicking(false); }}>
              {l.name[lang]}
            </button>
          ))}
        </div>
        {where && <small className="muted">{where}</small>}
        {startPoint.startsWith('pt:') && !where && <small className="muted">{t('Starting from', 'शुरुआत')}: {startName(data, startPoint)[lang]}</small>}
        {picking && (
          <>
            <small className="muted">{t('Tap the map where you will start: your hotel, a station, anywhere.', 'नक्शे पर वहाँ टैप करें जहाँ से शुरू करेंगे: होटल, स्टेशन, कहीं भी।')}</small>
            <Suspense fallback={<div className="map-picker" />}>
              <MapPicker center={data.city.center} value={startPoint.startsWith('pt:') ? startCoord(data, startPoint) : null} tokens={tokens} onPick={(c) => setStart(pointStart(c, 'pin'))} />
            </Suspense>
          </>
        )}
      </div>
      <div className="tap-step">
        <span className="tap-n">3</span>
        <b>{t("Who's coming, and how will you get around?", 'कौन आ रहा है, और कैसे घूमेंगे?')}</b>
        <div className="chips">
          {([['solo', t('Just me', 'सिर्फ़ मैं')], ['couple', t('Two of us', 'हम दो')], ['family', t('Family', 'परिवार')], ['friends', t('Friends', 'दोस्त')]] as const).map(([v, label]) => (
            <button key={v} className={`chip big${trip.who === v ? ' on' : ''}`} onClick={() => put({ who: v, group: GROUP[v] })}>
              {label}
            </button>
          ))}
        </div>
        <button className="link small" onClick={() => setAdjust((a) => !a)}>
          {people} {t('people', 'लोग')}{g.child ? ` · ${g.child} ${t('child', 'बच्चे')}` : ''}{g.foreign ? ` · ${g.foreign} ${t('from abroad', 'विदेशी')}` : ''}{trip.elders ? ` · ${t('elders', 'बुज़ुर्ग')}` : ''} · {adjust ? t('Done', 'ठीक') : t('Adjust', 'बदलें')}
        </button>
        {adjust && (
          <div className="form">
            <Counter label={t('Adults from India', 'भारत से वयस्क')} value={g.indian} min={0} onChange={(n) => put({ group: { ...g, indian: n } })} />
            <Counter label={t('Children', 'बच्चे')} note={t('Many monuments let children under 15 in free', 'कई स्मारकों में 15 से छोटे बच्चे मुफ़्त')} value={g.child} min={0} onChange={(n) => put({ group: { ...g, child: n } })} />
            <Counter label={t('Visitors from abroad', 'विदेश से आए लोग')} note={t('Foreign visitors pay a different ticket price', 'विदेशी पर्यटकों का टिकट अलग होता है')} value={g.foreign} min={0} onChange={(n) => put({ group: { ...g, foreign: n } })} />
            <Toggle on={trip.elders} onChange={(v) => put({ elders: v })} label={t('Travelling with elders', 'बुज़ुर्ग साथ हैं')} />
          </div>
        )}
        <Chips<Mode> value={trip.modes} onChange={(v) => put({ modes: v })} options={[{ v: 'walk', label: t('Walking', 'पैदल') }, { v: 'auto', label: t('Auto', 'ऑटो') }, { v: 'cab', label: t('Cab or own car', 'कैब या अपनी गाड़ी') }]} />
        <Toggle on={trip.night} onChange={(v) => put({ night: v })} label={t('Out after dark too', 'अंधेरे के बाद भी घूमेंगे')} />
      </div>
      <div className="tap-step">
        <span className="tap-n">4</span>
        <b>{t('What are you in the mood for?', 'आज किसमें रुचि है?')}</b>
        <div className="chips">
          {INTERESTS.filter((i) => i.tags.length).map((it) => {
            const on = picked.includes(it.id);
            return (
              <button key={it.id} className={`chip big${on ? ' on' : ''}`} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== it.id) : [...p, it.id]))}>
                {it.icon} {it[lang]}
              </button>
            );
          })}
        </div>
      </div>
      <button className="btn primary big sticky-cta" onClick={make} disabled={g.indian + g.foreign < 1 || !trip.modes.length}>
        <Icon name="route" size={20} /> {t('Make my roadmap', 'मेरा रोडमैप बनाएँ')}
      </button>
    </LayerPage>
  );
}
