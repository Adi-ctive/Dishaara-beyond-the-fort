import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { CITY_IDS, SEEDS, haversineKm } from '../../core';
import { StampArt, rarityOf } from '../../art/Stamp';
import { artFor } from '../../art/PlaceCover';
import { useNav } from '../../nav';
import { nowMinIST, todayIST, useStore, type Stamp } from '../../store';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../ui/Icon';
import { LayerPage, Seg } from '../../ui/Layer';
import { api, lastError, apiOn, type Reading } from '../../api';

const GEOFENCE_KM = 0.25;
const MIN_ACCURACY_M = 50;
const MAX_SPEED_KMH = 60;

/** Stamps needed for bronze, silver, gold: a quarter, half, and all of a city's countable places. */
export const tierNeeds = (total: number) => [Math.max(1, Math.ceil(total / 4)), Math.max(2, Math.ceil(total / 2)), total];
export const tierOf = (n: number, total: number) => {
  const [b, sv, g] = tierNeeds(total);
  return n >= g ? 'gold' : n >= sv ? 'silver' : n >= b ? 'bronze' : null;
};

// R18: the passport. One page per city; picking a city here also switches the app to it.
export function Passport() {
  const { data, s, setCity } = useStore();
  const { lang } = useTheme();
  const { open } = useNav();
  const hi = lang === 'hi';
  const counted = data.places.filter((p) => rarityOf(p) !== 'plain');
  const got = counted.filter((p) => s.stamps[p.id]?.status === 'confirmed').length;
  const tier = tierOf(got, counted.length);

  return (
    <LayerPage title={hi ? 'पासपोर्ट' : 'Passport'}>
      <Seg value={s.city} onChange={setCity} options={CITY_IDS.map((c) => ({ v: c, label: SEEDS[c].city.name[lang] }))} />
      <div className="passport-page">
        <div className="tier card">
          <div className="tier-bar">
            {(['bronze', 'silver', 'gold'] as const).map((t, i) => {
              const need = tierNeeds(counted.length)[i];
              return (
                <div key={t} className={`tier-step ${t}${got >= need ? ' on' : ''}`}>
                  <span className="tier-dot" />
                  <small>{t} · {need}</small>
                </div>
              );
            })}
          </div>
          <p className="small">
            <b>{got} / {counted.length}</b> {hi ? 'स्टैम्प (पूजा स्थल गिने नहीं जाते)' : 'stamps (places of worship are not counted)'} {tier && `· ${tier}`}
          </p>
          {s.city === 'gwalior' && <p className="small muted">{hi ? 'गोल्ड पर ग्वालियर नाइट थीम खुलती है।' : 'Gold unlocks the Gwalior night theme.'}</p>}
        </div>
        <div className="stamp-grid">
          {data.places.map((p, i) => {
            const st = s.stamps[p.id];
            return (
              <motion.button key={p.id} className={`stamp-cell${st ? ' got' : ''}`} style={{ ['--pc1' as string]: artFor(p.id).sky[0], ['--pc2' as string]: artFor(p.id).sky[1] }} onClick={() => open({ kind: 'story', id: p.id })} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}>
                <StampArt place={p} got={!!st} rarity={rarityOf(p)} size={92} date={st ? st.at.slice(5, 10) : undefined} />
                <span className="small">{p.name[lang]}</span>
                {st?.status === 'pending' && <span className="pending">{hi ? 'लंबित' : 'Pending'}</span>}
              </motion.button>
            );
          })}
        </div>
      </div>
    </LayerPage>
  );
}

type Check = { label: string; state: 'wait' | 'ok' | 'warn' | 'fail'; note?: string };

// R19: the stamp moment. Layered location check, then the stamp lands.
export function StampMoment({ id }: { id: string }) {
  const { data, s, set } = useStore();
  const { lang } = useTheme();
  const hi = lang === 'hi';
  const p = data.places.find((x) => x.id === id)!;
  const rarity = rarityOf(p);
  const have = s.stamps[id];
  const [checks, setChecks] = useState<Check[]>([]);
  const [result, setResult] = useState<Stamp['status'] | 'fail' | null>(have ? have.status : null);
  const [code, setCode] = useState('');

  // With a backend the server decides: readings over its dwell time, checked server-side.
  const runServer = async (code?: string) => {
    setResult(null);
    const h = await api.health();
    const dwell = Math.min(h?.dwellSeconds ?? 60, 90);
    setChecks([{ label: hi ? `${dwell} सेकंड तक लोकेशन पढ़ रहे हैं` : `Reading location for ${dwell} s`, state: 'wait' }]);
    const readings: Reading[] = [];
    if (!s.testMode && !code && navigator.geolocation) {
      for (let i = 0; i < 3; i++) {
        await new Promise<void>((res) => navigator.geolocation.getCurrentPosition((p) => { readings.push({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, t: Date.now() / 1000 }); res(); }, () => res(), { enableHighAccuracy: true, timeout: 8000 }));
        if (i < 2) await new Promise((res) => setTimeout(res, (dwell * 1000) / 2));
      }
    }
    const r = await api.stamp({ placeId: id, readings, code });
    if (!r) {
      setChecks([{ label: lastError || (hi ? 'सर्वर से जवाब नहीं मिला' : 'No answer from the server'), state: 'fail' }]);
      return setResult('fail');
    }
    const NAMES: Record<string, string> = { geofence: hi ? 'जगह की सीमा के अंदर' : 'Inside the place boundary', accuracy: hi ? 'GPS सटीकता' : 'GPS accuracy', dwell: hi ? 'कुछ देर वहीं रहे' : 'Stayed there a while', impossibleTravel: hi ? 'असंभव यात्रा नहीं' : 'No impossible jump', ipCity: hi ? 'नेटवर्क शहर' : 'Network city (soft signal)', counterCode: hi ? 'काउंटर कोड मिला' : 'Counter code matched' };
    setChecks(r.checks.map((c) => ({ label: NAMES[c.check] ?? c.check, state: c.ok ? 'ok' : c.soft ? 'warn' : 'fail', note: hi ? 'सर्वर ने जाँचा' : 'checked by the server' })));
    if (r.status === 'rejected') return setResult('fail');
    set((c) => ({
      stamps: { ...c.stamps, [id]: { at: `${todayIST()}T${new Date().toISOString().slice(11)}`, status: r.status as Stamp['status'], quiet: nowMinIST() < 600, rare: r.rarity === 'rare' } },
      points: c.points + r.points,
      history: [{ date: todayIST(), places: [id] }, ...c.history],
    }));
    setResult(r.status as Stamp['status']);
  };

  // Stamps are checked on the server only (location readings, dwell, impossible travel, counter code).
  useEffect(() => {
    if (!have && apiOn()) runServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The counter code rotates at the site (Decision 24); the server checks it.
  const qr = () => {
    if (code.trim()) void runServer(code.trim());
  };

  return (
    <LayerPage title={hi ? 'स्टैम्प' : 'Stamp'}>
      <div className="stamp-stage">
        <AnimatePresence>
          {result === 'confirmed' || result === 'pending' ? (
            <motion.div key="got" initial={{ scale: 2.4, opacity: 0, rotate: -25 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', damping: 11, stiffness: 180 }}>
              <StampArt place={p} got rarity={rarity} size={200} date={todayIST().slice(5, 10)} />
            </motion.div>
          ) : (
            <motion.div key="empty" exit={{ opacity: 0 }}>
              <StampArt place={p} got={false} rarity={rarity} size={200} />
            </motion.div>
          )}
        </AnimatePresence>
        {(result === 'confirmed' || result === 'pending') && <motion.div className="ink-burst" initial={{ scale: 0.4, opacity: 0.6 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 0.8 }} />}
      </div>
      <h2 className="display small center-text">{p.name[lang]}</h2>
      {!apiOn() && <p className="center-text muted">{hi ? 'स्टैम्प के लिए सर्वर चाहिए।' : 'Stamps need the server.'}</p>}
      {result === 'confirmed' && <p className="center-text"><b>{rarity === 'rare' ? (hi ? 'दुर्लभ स्टैम्प!' : 'Rare stamp!') : hi ? 'स्टैम्प मिला' : 'Stamp collected'}</b></p>}
      {result === 'pending' && <p className="center-text muted">{hi ? 'लंबित: दूसरा सबूत (QR) चाहिए' : 'Pending: needs a second proof, like the counter QR code'}</p>}
      {result === 'fail' && <p className="center-text">{hi ? 'आप अभी इस जगह पर नहीं लगते।' : "You don't seem to be at this place yet."}</p>}
      {rarity === 'plain' && <p className="center-text small muted">{hi ? 'पूजा और संवेदनशील स्थलों पर सादा स्टैम्प, कोई बोनस नहीं।' : 'Places of worship and sensitive sites give a plain stamp, no bonus.'}</p>}

      <ul className="checks">
        {checks.map((c, i) => (
          <motion.li key={i} className={c.state} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
            <span className="check-dot">{c.state === 'ok' ? <Icon name="check" size={14} /> : c.state === 'fail' ? <Icon name="x" size={14} /> : c.state === 'warn' ? '!' : ''}</span>
            <span className="grow">{c.label}</span>
            {c.note && <span className="small muted">{c.note}</span>}
          </motion.li>
        ))}
      </ul>

      {(result === 'fail' || result === 'pending') && (
        <div className="qr card">
          <b>{hi ? 'काउंटर का QR कोड' : 'Code at the counter'}</b>
          <small className="muted">{hi ? 'सबसे पक्का सबूत। आज का कोड काउंटर पर पूछें।' : "Strongest proof. Ask the counter for today's code."}</small>
          <div className="row-actions">
            <input value={code} onChange={(e) => setCode(e.target.value)} aria-label="Counter code" />
            <button className="btn primary" onClick={qr}>{hi ? 'जाँचें' : 'Check'}</button>
          </div>
          <button className="link" onClick={() => runServer()}>{hi ? 'फिर से कोशिश' : 'Try location again'}</button>
        </div>
      )}
      {s.testMode && <p className="small muted center-text">{hi ? 'टेस्ट मोड चालू (मॉडरेटर)' : 'Test mode is on (moderator setting). Location is simulated.'}</p>}
    </LayerPage>
  );
}
