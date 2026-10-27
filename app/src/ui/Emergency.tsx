import { useState } from 'react';
import { t } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { api, apiOn } from '../api';
import { nowMinIST, useStore } from '../store';
import { LABEL_TEXT } from './facts';

// Emergency help. A small shield in the top bar is always there; the big floating button
// appears only while a trip is live (from 30 min before the roadmap starts to 1 h after it ends).
// 112 is a real phone call. The city directory (helplines, hospitals, police, transport) comes from
// official district pages and is labelled like every other fact.
export function useTripLive(): boolean {
  const { plan, today } = useStore();
  if (!plan || !plan.stops.length || plan.input.date !== today) return false;
  const now = nowMinIST();
  return now >= plan.startMin - 30 && now <= plan.finish + 60;
}

const FIRST = ['emergency', 'hospital', 'police', 'transport'];

/** The city's numbers, by category, with a search box. Every row calls on tap. */
function Directory() {
  const { data } = useStore();
  const { lang } = useTheme();
  const hi = lang === 'hi';
  const [cat, setCat] = useState('emergency');
  const [q, setQ] = useState('');
  const all = data.directory ?? [];
  const cats = [...FIRST, ...Object.keys(data.directoryCats ?? {}).filter((c) => !FIRST.includes(c))].filter((c) => all.some((e) => e.cat === c));
  const list = all.filter((e) => (q ? `${e.name.en} ${e.name.hi} ${e.address ?? ''}`.toLowerCase().includes(q.toLowerCase()) : e.cat === cat));
  if (!all.length) return null;
  return (
    <div className="directory">
      <h3 className="section-title">{hi ? `${data.city.name.hi} के ज़रूरी नंबर` : `Important numbers, ${data.city.name.en}`}</h3>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={hi ? 'खोजें: अस्पताल, थाना, होटल' : 'Search: hospital, police station, hotel'} aria-label="Search numbers" />
      {!q && (
        <div className="chips">
          {cats.map((c) => (
            <button key={c} className={`chip${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{data.directoryCats?.[c]?.[lang] ?? c}</button>
          ))}
        </div>
      )}
      {list.map((e) => (
        <div key={e.id} className="dir-row">
          <span className="grow">
            <b>{e.name[lang]}</b>
            {e.address && <small className="muted">{e.address}</small>}
            <small className={`chip-trust ${LABEL_TEXT[e.s].tone}`}>{LABEL_TEXT[e.s][lang]} · {data.sources[e.src]?.name ?? e.src}</small>
          </span>
          <span className="dir-phones">
            {e.phones.map((p) => (
              <a key={p} className="btn ghost small" href={`tel:${p.replace(/\(.*?\)|[^\d+]/g, '')}`}><Icon name="phone" size={14} /> {p}</a>
            ))}
          </span>
        </div>
      ))}
      {!list.length && <p className="muted small">{hi ? 'कुछ नहीं मिला।' : 'Nothing found.'}</p>}
    </div>
  );
}

export function Emergency({ variant = 'float' }: { variant?: 'float' | 'top' }) {
  const { lang } = useTheme();
  const hi = lang === 'hi';
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const { s } = useStore();
  // Location goes with the alert only if the raahi already allowed location.
  const alertTeam = () => {
    const done = () => setSent(true);
    if (s.prefs.location && navigator.geolocation)
      navigator.geolocation.getCurrentPosition((p) => api.sos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }).then(done), () => api.sos({}).then(done), { timeout: 4000 });
    else api.sos({}).then(done);
  };
  // Sends a map link of where the raahi is right now, through the phone's own share sheet (WhatsApp, SMS).
  const shareLocation = () => {
    if (!navigator.geolocation) return setShareNote(hi ? 'इस फ़ोन पर लोकेशन उपलब्ध नहीं।' : 'Location is not available on this phone.');
    setShareNote(hi ? 'लोकेशन ढूँढ रहे हैं' : 'Finding your location');
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const url = `https://maps.google.com/?q=${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`;
        const text = hi ? `मुझे मदद चाहिए। मैं यहाँ हूँ: ${url}` : `I need help. I am here: ${url}`;
        try {
          if (navigator.share) await navigator.share({ text });
          else window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
          setShareNote('');
        } catch {
          setShareNote('');
        }
      },
      () => setShareNote(hi ? 'लोकेशन नहीं मिली। फ़ोन की लोकेशन चालू करें।' : 'Could not get your location. Turn on location for this site.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };
  return (
    <>
      {variant === 'top' ? (
        <button className="icon-btn sos-top" onClick={() => setOpen(true)} aria-label={t('sos', lang)} title={t('sos', lang)}>
          <Icon name="shield" size={19} />
        </button>
      ) : (
        <button className="sos" onClick={() => setOpen(true)} aria-label={t('sos', lang)}>
          <Icon name="shield" size={22} />
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('sos', lang)}>
        <div className="sos-list">
          <a className="sos-row primary" href="tel:112" onClick={() => apiOn() && alertTeam()}>
            <Icon name="phone" size={22} />
            <span>
              <b>{t('call112', lang)}</b>
              <small>{t('call112Sub', lang)}</small>
            </span>
          </a>
          <button className="sos-row" onClick={shareLocation}>
            <Icon name="pin" size={22} />
            <span>
              <b>{t('shareLoc', lang)}</b>
              <small>{shareNote || (hi ? 'व्हाट्सऐप या SMS से नक्शे का लिंक भेजें' : 'Send a map link by WhatsApp or SMS')}</small>
            </span>
          </button>
          {apiOn() && (
            <button className="sos-row" onClick={alertTeam}>
              <Icon name="alert" size={22} />
              <span>
                <b>{t('alertTeam', lang)}</b>
                <small>{sent ? (hi ? 'भेजा गया' : 'Sent to moderators') : t('alertTeamSub', lang)}</small>
              </span>
            </button>
          )}
        </div>
        <Directory />
      </Sheet>
    </>
  );
}
