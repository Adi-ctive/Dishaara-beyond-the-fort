import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { api, apiOn, mediaUrl, type Shop } from '../../api';
import { useStore } from '../../store';
import { useNav } from '../../nav';
import { Seg } from '../../ui/Layer';
import { BizCover, BizIcon } from '../../art/BizArt';
import { Community } from '../Social';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../ui/Icon';
import { LayerPage } from '../../ui/Layer';

const KINDS: { v: Shop['kind'] | 'all'; en: string; hi: string }[] = [
  { v: 'all', en: 'All', hi: 'सब' },
  { v: 'food', en: 'Food', hi: 'खाना' },
  { v: 'craft', en: 'Crafts', hi: 'शिल्प' },
  { v: 'shop', en: 'Shops', hi: 'दुकानें' },
  { v: 'stay', en: 'Stays', hi: 'ठहरना' },
  { v: 'guide', en: 'Guides', hi: 'गाइड' },
  { v: 'activity', en: 'Activities', hi: 'गतिविधियाँ' },
];

/** Shops of the city on screen, from the server: owners applied, a moderator approved. */
export function useShops() {
  const { s } = useStore();
  const [shops, setShops] = useState<Shop[] | null>(null);
  useEffect(() => {
    if (!apiOn()) return setShops([]);
    let alive = true;
    setShops(null);
    api.bazaar(s.city).then((r) => alive && setShops(r ?? []));
    return () => {
      alive = false;
    };
  }, [s.city]);
  return shops;
}

// R16: businesses near today's route. Owner-provided, labelled so. No star ratings.
export function BazaarTab() {
  const { data, plan } = useStore();
  const { lang } = useTheme();
  const { open } = useNav();
  const hi = lang === 'hi';
  const [view, setView] = useState<'shops' | 'feed'>('shops');
  const [kind, setKind] = useState<Shop['kind'] | 'all'>('all');
  const [all, setAll] = useState(false);
  const shops = useShops();
  const onRoute = plan && plan.stops.length && !all ? new Set(plan.stops.map((s) => s.place.id)) : null;
  const list = (shops ?? []).filter((b) => (kind === 'all' || b.kind === kind) && (!onRoute || (b.near && onRoute.has(b.near)) || b.sponsored));

  return (
    <div className="screen">
      <h1 className="display small">{hi ? 'बाज़ार' : 'Bazaar'}</h1>
      <Seg value={view} onChange={setView} options={[{ v: 'shops', label: hi ? 'दुकानें' : 'Shops' }, { v: 'feed', label: hi ? 'समुदाय' : 'Community' }]} />
      {view === 'feed' ? (
        <Community />
      ) : (
        <>
          <div className="row-actions">
            <p className="muted small grow">{onRoute ? (hi ? 'आपके आज के रास्ते के पास।' : 'Near your route today.') : hi ? 'सभी दुकानें।' : 'All listings.'}</p>
            {plan && plan.stops.length > 0 && (
              <button className="link" onClick={() => setAll(!all)}>{all ? (hi ? 'सिर्फ़ रास्ते की' : 'Only my route') : hi ? 'सब दिखाएँ' : 'Show all'}</button>
            )}
          </div>
          <div className="chips">
            {KINDS.map((k) => (
              <button key={k.v} className={`chip${kind === k.v ? ' on' : ''}`} onClick={() => setKind(k.v)}>
                {k[lang]}
              </button>
            ))}
          </div>
          {shops === null && <p className="muted">{hi ? 'लोड हो रहा है' : 'Loading'}</p>}
          {list.map((b, i) => {
            const near = data.places.find((p) => p.id === b.near);
            return (
              <motion.button key={b.id} className={`biz2${b.sponsored ? ' sponsored' : ''}`} onClick={() => open({ kind: 'biz', id: b.id })} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileTap={{ scale: 0.98 }}>
                <span className="biz2-cover">{b.photos?.length ? <img className="biz-photo" src={mediaUrl(b.photos[0])} alt="" loading="lazy" style={{ height: 92 }} /> : <BizCover kind={b.kind} height={92} />}{b.sponsored && <span className="spons hero-spons">{hi ? 'प्रायोजित' : 'Sponsored'}</span>}</span>
                <span className="biz2-body">
                  <span className="biz-top">
                    <span className={`biz-kind ${b.kind}`} aria-hidden="true"><BizIcon kind={b.kind} /></span>
                    <b className="grow">{b.name}</b>
                  </span>
                  {near && <span className="small muted">{hi ? 'पास में' : 'Near'} {near.name[lang]}</span>}
                  {b.details && <span className="small">{b.details}</span>}
                  <span className="small muted">{hi ? 'मालिक की दी जानकारी, बदल सकती है' : 'Provided by the owner, may vary'}</span>
                </span>
              </motion.button>
            );
          })}
          {shops !== null && list.length === 0 && (
            <p className="muted">{onRoute ? (hi ? 'इस रास्ते पर अभी कोई दुकान नहीं।' : 'No shops listed on this route yet.') : hi ? 'इस शहर में अभी कोई दुकान सूची में नहीं। दुकान के मालिक प्रोफ़ाइल से आवेदन कर सकते हैं।' : 'No shops listed in this city yet. Shop owners can apply from their profile.'}</p>
          )}
        </>
      )}
    </div>
  );
}

type Alert = { id: string; kind: string; en: string; hi?: string; source: string; at: string; link?: string };

// R9: alerts. Live weather (refreshed every 4 hours) and news a moderator approved, with source.
export function Alerts() {
  const { s } = useStore();
  const { lang } = useTheme();
  const hi = lang === 'hi';
  const icon: Record<string, string> = { crowd: 'users', news: 'news', safety: 'shield', weather: 'sun' };
  const [list, setList] = useState<Alert[] | null>(null);
  useEffect(() => {
    if (!apiOn()) return setList([]);
    api.alerts(s.city).then((a) => setList(a ?? []));
  }, [s.city]);
  return (
    <LayerPage title={hi ? 'सूचनाएँ' : 'Alerts'}>
      {list === null && <p className="muted">{hi ? 'लोड हो रहा है' : 'Loading'}</p>}
      {list?.map((a, i) => (
        <motion.div key={a.id} className={`alert card ${a.kind}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
          <Icon name={icon[a.kind] ?? 'news'} size={22} />
          <span className="grow">
            <b>{hi && a.hi ? a.hi : a.en}</b>
            <small>{a.link ? <a href={a.link} target="_blank" rel="noreferrer">{a.source}</a> : a.source} · {a.at}</small>
          </span>
        </motion.div>
      ))}
      {list?.length === 0 && <p className="muted">{hi ? 'अभी कोई सूचना नहीं।' : 'No alerts right now.'}</p>}
      <p className="muted small">{hi ? 'मौसम हर 4 घंटे में ताज़ा होता है। ख़बरें मॉडरेटर की मंज़ूरी के बाद ही आती हैं।' : 'Weather refreshes every 4 hours. News reaches raahis only after a moderator approves it.'}</p>
    </LayerPage>
  );
}
