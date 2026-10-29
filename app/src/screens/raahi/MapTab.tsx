import { motion } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';

// MapLibre is big: load it only when the map tab opens.
const LiveMap = lazy(() => import('../../map/LiveMap').then((m) => ({ default: m.LiveMap })));
import { haversineKm, rankedPlaces, startCoord } from '../../core';
import { Seg } from '../../ui/Layer';
import { useNav } from '../../nav';
import { useStore } from '../../store';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../ui/Icon';
import type { Shop } from '../../api';
import { useShops } from './Bazaar';
import { PlaceCover, artFor } from '../../art/PlaceCover';
import { BizCover, BizIcon } from '../../art/BizArt';
import { checkUnit } from '../../core';
import { LiveAlert, VERDICT_TEXT } from '../../ui/facts';

const W = 360;
const H = 440;
const PAD = 34;

// R8: a stylised map. Positions come from the stored coordinates. It draws no streets, because
// we have no street data, only straight dotted lines between stops.
export function MapTab() {
  const { data, plan, s, set, today } = useStore();
  const { lang, tokens } = useTheme();
  const { open } = useNav();
  const hi = lang === 'hi';
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<'live' | 'sketch'>(() => (navigator.onLine ? 'live' : 'sketch'));
  const [road, setRoad] = useState<boolean | null>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const pick = useCallback((id: string) => setSel(id), []);
  const onRoad = useCallback((r: boolean | null) => setRoad(r), []);
  useEffect(() => {
    if (!s.prefs.location || !navigator.geolocation) return;
    const w = navigator.geolocation.watchPosition((p) => setMe([p.coords.latitude, p.coords.longitude]), () => setMe(null), { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(w);
  }, [s.prefs.location]);
  const [zoom, setZoom] = useState<'fort' | 'city'>('fort');
  const [layer, setLayer] = useState<'places' | 'both'>('both');
  const [focus, setFocus] = useState<[number, number] | null>(null);

  const placeIds = useMemo(() => data.places.map((p) => p.id), [data]);
  // Shops from the server, at the pin their owner gave (shops without a pin are not drawn).
  const listed = useShops();
  const shops = useMemo(
    () =>
      layer === 'both'
        ? (listed ?? []).filter((b) => b.lat != null && b.lng != null).map((b) => ({ id: b.id, kind: b.kind, name: b.name, coord: [b.lat!, b.lng!] as [number, number] }))
        : [],
    [layer, listed],
  );
  const locate = useCallback(
    (id: string): [number, number] | null => {
      const p = data.places.find((x) => x.id === id);
      if (p) return p.units[0].coord;
      return shops.find((x) => x.id === id)?.coord ?? null;
    },
    [data, shops],
  );
  const choose = (id: string) => {
    setSel(id);
    setFocus(locate(id));
  };
  // Search above the map: places by name (spelling slips allowed), then listed shops.
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const ranked = rankedPlaces(data, q);
    const byText = data.places.filter((p) => p.name.en.toLowerCase().includes(t) || p.name.hi.includes(q.trim()) || p.type.en.toLowerCase().includes(t)).map((p) => p.id);
    const placeHits = [...new Set([...ranked, ...byText])].slice(0, 6).map((id) => ({ id, name: data.places.find((p) => p.id === id)!.name[lang], shop: false }));
    const shopHits = (listed ?? []).filter((b) => b.name.toLowerCase().includes(t)).slice(0, 3).map((b) => ({ id: b.id, name: b.name, shop: true }));
    return [...placeHits, ...shopHits];
  }, [q, data, lang, listed]);
  const jump = (id: string) => {
    setMode('live');
    setLayer('both');
    choose(id);
    setQ('');
  };
  // Arriving from "Show on map" on a place or listing page.
  useEffect(() => {
    if (!s.mapFocus) return;
    setMode('live');
    setLayer('both');
    setSel(s.mapFocus);
    const p = data.places.find((x) => x.id === s.mapFocus);
    const b = (listed ?? []).find((x) => x.id === s.mapFocus);
    if (p) setFocus(p.units[0].coord);
    else if (b && b.lat != null && b.lng != null) setFocus([b.lat, b.lng]);
    else if (s.mapFocus.startsWith('geo:')) setFocus(s.mapFocus.slice(4).split(',').map(Number) as [number, number]);  // a spot from chat
    set({ mapFocus: null });
  }, [s.mapFocus, data, set, listed]);

  const points = useMemo(() => {
    // The "fort area" view centres on the fort in Gwalior and on the old city elsewhere.
    const fort = (data.landmarks.find((l) => l.id === 'fort') ?? data.landmarks.find((l) => l.id !== 'station'))?.coord ?? data.city.center;
    const near = (c: [number, number]) => zoom === 'city' || haversineKm(c, fort) <= 1.6;
    const units = data.places.map((p) => ({ id: p.id, name: p.name, coord: p.units[0].coord, place: p })).filter((u) => near(u.coord));
    const marks = data.landmarks.filter((l) => near(l.coord));
    const all = [...units.map((u) => u.coord), ...marks.map((l) => l.coord)];
    const lats = all.map((c) => c[0]);
    const lngs = all.map((c) => c[1]);
    const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    // Keep the aspect ratio of real distances (1° of longitude is shorter at this latitude).
    const kx = Math.cos((((a + b) / 2) * Math.PI) / 180);
    const spanX = (d - c) * kx;
    const spanY = b - a;
    const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
    const proj = (co: [number, number]): [number, number] => [PAD + (co[1] - c) * kx * scale + ((W - 2 * PAD) - spanX * scale) / 2, H - PAD - (co[0] - a) * scale - ((H - 2 * PAD) - spanY * scale) / 2];
    return { units: units.map((u) => ({ ...u, xy: proj(u.coord) })), marks: marks.map((l) => ({ ...l, xy: proj(l.coord) })), proj };
  }, [data, zoom]);

  const route = plan ? [startCoord(data, plan.input.startPoint), ...plan.stops.map((x) => x.unit.coord), ...(plan.returnLeg ? [startCoord(data, plan.input.startPoint)] : [])].map(points.proj) : [];
  const stopIndex = (id: string) => (plan ? plan.stops.findIndex((x) => x.place.id === id) : -1);
  const selPlace = data.places.find((p) => p.id === sel);
  const selected = selPlace ? { id: selPlace.id, name: selPlace.name, place: selPlace } : undefined;

  // Labels: right of the pin, or left near the right edge; pushed down when they would overlap.
  const labels = useMemo(() => {
    const placed: { x: number; y: number }[] = [];
    const out: Record<string, { x: number; y: number; end: boolean }> = {};
    for (const u of [...points.units].sort((a, b) => a.xy[1] - b.xy[1])) {
      const end = u.xy[0] > W * 0.62;
      let y = u.xy[1] + 4;
      while (placed.some((p) => Math.abs(p.y - y) < 12 && Math.abs(p.x - u.xy[0]) < 110)) y += 12;
      placed.push({ x: u.xy[0], y });
      out[u.id] = { x: end ? u.xy[0] - 15 : u.xy[0] + 15, y, end };
    }
    return out;
  }, [points]);
  const crowded = (xy: [number, number]) => points.units.some((u) => Math.hypot(u.xy[0] - xy[0], u.xy[1] - xy[1]) < 16);

  return (
    <div className="screen">
      <h1 className="display small">{hi ? 'नक्शा' : 'Map'}</h1>
      <div className="map-search">
        <Icon name="pin" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={hi ? 'जगह या दुकान खोजें' : 'Search a place or shop'} aria-label={hi ? 'नक्शे पर खोजें' : 'Search the map'} onKeyDown={(e) => e.key === 'Enter' && hits[0] && jump(hits[0].id)} />
        {q && <button className="icon-btn" onClick={() => setQ('')} aria-label={hi ? 'साफ़ करें' : 'Clear'}><Icon name="x" size={14} /></button>}
        {hits.length > 0 && (
          <div className="map-search-list" role="listbox">
            {hits.map((h) => (
              <button key={h.id} role="option" aria-selected={false} onClick={() => jump(h.id)}>
                <Icon name={h.shop ? 'store' : 'pin'} size={14} /> {h.name}
              </button>
            ))}
          </div>
        )}
        {q.trim().length >= 2 && hits.length === 0 && <div className="map-search-list"><span className="muted small">{hi ? 'कुछ नहीं मिला' : 'Nothing found'}</span></div>}
      </div>
      <Seg value={mode} onChange={(m) => { setMode(m); setSel(null); }} options={[{ v: 'live', label: hi ? 'असली नक्शा' : 'Live map' }, { v: 'sketch', label: hi ? 'स्केच (ऑफ़लाइन)' : 'Sketch (offline)' }]} />
      {mode === 'live' ? (
        <div className="map-wrap">
          <div className="chips">
            <button className={`chip${layer === 'both' ? ' on' : ''}`} onClick={() => setLayer('both')}>{hi ? 'जगहें और दुकानें' : 'Places and shops'}</button>
            <button className={`chip${layer === 'places' ? ' on' : ''}`} onClick={() => { setLayer('places'); if (sel?.startsWith('b')) setSel(null); }}>{hi ? 'सिर्फ़ जगहें' : 'Places only'}</button>
          </div>
          <div className="map-stage">
            <Suspense fallback={<div className="live-map map-loading">{hi ? 'नक्शा लोड हो रहा है' : 'Loading map'}</div>}>
              <LiveMap data={data} plan={plan} ids={placeIds} shops={shops} selected={sel} focus={focus} stamps={s.stamps} tokens={tokens} lang={lang} me={me} onPick={pick} onRoad={onRoad} />
            </Suspense>
            {sel && <MapPreview id={sel} onClose={() => setSel(null)} shops={listed ?? []} />}
          </div>
          <p className="small muted">
            {road === true ? (hi ? 'रास्ता OpenStreetMap से। समय हमारा अनुमान है।' : 'Road shape from OpenStreetMap routing. Times are our estimates.') : road === false ? (hi ? 'रास्ता नहीं मिला, सीधी रेखाएँ दिखाईं।' : 'Routing unavailable, showing straight lines.') : hi ? 'रोडमैप बनाने पर रास्ता दिखेगा।' : 'Make a roadmap to see the route.'}
          </p>
          <div className="map-strip" role="group" aria-label={hi ? 'जगहें' : 'Places'}>
            {data.places.map((p) => {
              const v = VERDICT_TEXT[checkUnit(data, p.units[0], today).verdict];
              return (
                <button key={p.id} className={`strip-card${sel === p.id ? ' on' : ''}`} style={{ ['--pc1' as string]: artFor(p.id).sky[0] }} onClick={() => choose(p.id)}>
                  <PlaceCover id={p.id} height={64} />
                  <b>{p.name[lang]}</b>
                  <span className={`verdict ${v.tone}`}>{v[lang]}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
      <>
      <Seg value={zoom} onChange={(z) => { setZoom(z); setSel(null); }} options={[{ v: 'fort', label: s.city === 'gwalior' ? (hi ? 'किला क्षेत्र' : 'Fort area') : hi ? 'पुराना शहर' : 'Old city' }, { v: 'city', label: hi ? 'पूरा शहर' : 'Whole city' }]} />
      <div className="map-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="map" role="img" aria-label={hi ? 'जगहों का नक्शा' : 'Map of places'}>
          <defs>
            <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="var(--line)" />
            </pattern>
          </defs>
          <rect width={W} height={H} rx="22" fill="var(--surface2)" />
          <rect width={W} height={H} rx="22" fill="url(#dots)" />
          {[60, 120, 190].map((r) => (
            <circle key={r} cx={W * 0.42} cy={H * 0.42} r={r} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
          ))}
          <g transform={`translate(${W - 40} 40)`} className="compass">
            <circle r="16" fill="var(--surface)" stroke="var(--line)" />
            <path d="M0-12L4 0 0 12-4 0z" fill="var(--accent)" />
            <text y="-19" textAnchor="middle" fontSize="9" fill="var(--muted)">N</text>
          </g>
          {route.length > 1 && (
            <motion.polyline
              key={zoom}
              points={route.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="0.1 9"
              initial={false}
              animate={{ opacity: 1, strokeDashoffset: [0, -36] }}
              transition={{ opacity: { duration: 0.6 }, strokeDashoffset: { duration: 2.4, repeat: Infinity, ease: 'linear' } }}
            />
          )}
          {points.marks.map((m) => (
            <g key={m.id} transform={`translate(${m.xy[0]} ${m.xy[1]})`}>
              <rect x="-5" y="-5" width="10" height="10" rx="2" fill="var(--ink)" />
              {!crowded(m.xy) && <text x="9" y="4" fontSize="9.5" fill="var(--muted)">{m.name[lang].split(' (')[0]}</text>}
            </g>
          ))}
          {points.units.map((u, i) => {
            const n = stopIndex(u.id);
            const got = !!s.stamps[u.id];
            return (
              <motion.g key={u.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2 + i * 0.05, type: 'spring' }} style={{ transformOrigin: `${u.xy[0]}px ${u.xy[1]}px`, cursor: 'pointer' }} onClick={() => setSel(u.id)}>
                <circle cx={u.xy[0]} cy={u.xy[1]} r={n >= 0 ? 12 : 8} fill={n >= 0 ? 'var(--primary)' : got ? 'var(--accent)' : 'var(--surface)'} stroke={sel === u.id ? 'var(--accent)' : 'var(--primary)'} strokeWidth={sel === u.id ? 3 : 1.5} />
                {n >= 0 && <text x={u.xy[0]} y={u.xy[1] + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--onPrimary)">{n + 1}</text>}
                {zoom === 'fort' && (
                  <text x={labels[u.id].x} y={labels[u.id].y} textAnchor={labels[u.id].end ? 'end' : 'start'} fontSize="9.5" fill="var(--ink)" paintOrder="stroke" stroke="var(--surface2)" strokeWidth="3">
                    {u.name[lang]}
                  </text>
                )}
              </motion.g>
            );
          })}
        </svg>
        <p className="small muted">{hi ? 'पैमाने पर नहीं। बिंदु रेखाएँ सीधी दूरी हैं, सड़कें नहीं।' : 'Not a street map. Dotted lines are straight distances, not roads.'}</p>
      </div>
      </>
      )}
      {selected ? (
        <button className="card row" onClick={() => open({ kind: 'place', id: selected.id })}>
          <Icon name="pin" size={22} />
          <span className="grow"><b>{selected.name[lang]}</b><small>{selected.place.type[lang]}</small></span>
          <Icon name="arrow" size={16} />
        </button>
      ) : (
        <p className="muted small">{hi ? 'किसी बिंदु पर टैप करें।' : 'Tap a pin to see the place.'}</p>
      )}
      <div className="legend small">
        <span><i className="dot primary" /> {hi ? 'आपके रोडमैप में' : 'In your roadmap'}</span>
        <span><i className="dot accent" /> {hi ? 'स्टैम्प मिला' : 'Stamp collected'}</span>
        <span><i className="dot square" /> {hi ? 'शुरुआती जगहें' : 'Start points'}</span>
      </div>
    </div>
  );
}

// The card that appears over the map when a pin or strip card is chosen.
function MapPreview({ id, onClose, shops }: { id: string; onClose: () => void; shops: Shop[] }) {
  const { data, today, s } = useStore();
  const { lang } = useTheme();
  const { open } = useNav();
  const hi = lang === 'hi';
  const p = data.places.find((x) => x.id === id);
  const b = shops.find((x) => x.id === id);
  if (!p && !b) return null;
  const v = p ? VERDICT_TEXT[checkUnit(data, p.units[0], today).verdict] : null;
  return (
    <motion.div className="map-preview" initial={{ y: 30 }} animate={{ y: 0, opacity: 1 }} key={id}>
      <button className="map-preview-close" onClick={onClose} aria-label={hi ? 'बंद करें' : 'Close'}><Icon name="x" size={16} /></button>
      <button className="map-preview-body" onClick={() => (p ? open({ kind: 'story', id }) : open({ kind: 'biz', id }))}>
        <span className="mp-art">{p ? <PlaceCover id={id} height={86} /> : b && <BizCover kind={b.kind} height={86} />}</span>
        <span className="mp-text">
          <b>{p ? p.name[lang] : b!.name}</b>
          <small>{p ? p.type[lang] : hi ? 'मालिक की दी जानकारी' : 'Owner-provided'}</small>
          {v ? <span className={`verdict ${v.tone}`}>{v[lang]}</span> : b && <span className={`biz-kind ${b.kind}`}><BizIcon kind={b.kind} size={18} /></span>}
          {p && <LiveAlert p={p} twists={s.twists} lang={lang} compact />}
        </span>
        <span className="pc-go"><Icon name="arrow" size={16} /></span>
      </button>
    </motion.div>
  );
}
