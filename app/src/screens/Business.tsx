// B1-B4: business owner screens, all from the server. An owner applies, a moderator approves,
// then the shop shows in the Bazaar and these screens show its real counts and comments.
import { lazy, Suspense, useEffect, useState } from 'react';
import { api, lastError, mediaUrl, uploadShopPhoto, type ServerComment, type Shop } from '../api';
import { shrink } from './Saarthi';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../ui/Icon';
import { LayerPage, Section, Seg } from '../ui/Layer';
import { useTr } from '../ui/tr';

// The map library is large: it loads only when an owner opens a map.
const MapPicker = lazy(() => import('../map/MapPicker').then((m) => ({ default: m.MapPicker })));

const KIND_OPTS = (tr: (en: string, hi: string) => string) => [
  { v: 'food', label: tr('Food', 'खाना') },
  { v: 'craft', label: tr('Craft', 'शिल्प') },
  { v: 'shop', label: tr('Shop', 'दुकान') },
  { v: 'stay', label: tr('Stay', 'ठहरना') },
  { v: 'guide', label: tr('Guide', 'गाइड') },
  { v: 'activity', label: tr('Activity', 'गतिविधि') },
];

/** The signed-in owner's shop. undefined while loading, null when they have none yet. */
function useMyShop(refresh = 0) {
  const [b, setB] = useState<Shop | null | undefined>(undefined);
  useEffect(() => {
    api.myBusiness().then((r) => setB(r));
  }, [refresh]);
  return [b, setB] as const;
}

/** A raahi lists their shop. It goes to a moderator before anyone sees it. */
export function ApplyBusiness() {
  const { s, data } = useStore();
  const { lang, tokens } = useTheme();
  const tr = useTr();
  const [f, setF] = useState({ name: '', kind: 'food', near: '', details: '', phone: '' });
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [sent, setSent] = useState<Shop | null>(null);
  const [err, setErr] = useState('');
  // Someone who already applied sees where their shop stands, not a fresh form.
  useEffect(() => {
    api.myBusiness().then((b) => b && setSent(b));
  }, []);
  const send = () => {
    if (f.name.trim().length < 2) return setErr(tr('Give the shop a name.', 'दुकान का नाम लिखें।'));
    api.applyBusiness({ ...f, name: f.name.trim(), city: s.city, ...(pin ? { lat: pin[0], lng: pin[1] } : {}) }).then((r) => (r ? setSent(r) : setErr(lastError)));
  };
  if (sent) {
    return (
      <LayerPage title={tr('List your shop', 'अपनी दुकान जोड़ें')}>
        <b>{sent.name}</b>
        {sent.status === 'live' ? (
          <p>{tr('Approved and listed in the Bazaar. Sign in as Business to manage it.', 'मंज़ूर और बाज़ार में सूचीबद्ध। इसे संभालने के लिए व्यवसाय के रूप में साइन इन करें।')}</p>
        ) : sent.status === 'rejected' ? (
          <p>{tr('A moderator did not approve this listing.', 'मॉडरेटर ने यह लिस्टिंग मंज़ूर नहीं की।')}</p>
        ) : (
          <p>{tr('Waiting for a moderator. Once approved, it shows in the Bazaar and your Business app opens when you sign in as Business.', 'मॉडरेटर की मंज़ूरी बाकी। मंज़ूरी के बाद यह बाज़ार में दिखेगी और व्यवसाय के रूप में साइन इन करने पर आपका व्यवसाय ऐप खुलेगा।')}</p>
        )}
      </LayerPage>
    );
  }
  return (
    <LayerPage title={tr('List your shop', 'अपनी दुकान जोड़ें')}>
      <p className="muted">{tr('Food stalls, crafts, shops, stays, guides and activities near the places in Dishaara. Free to list.', 'दिशारा की जगहों के पास खाने के ठेले, शिल्प, दुकानें, ठहरना, गाइड और गतिविधियाँ। सूची में जोड़ना मुफ़्त।')}</p>
      <label className="field"><span>{tr('Shop name', 'दुकान का नाम')}</span><input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <div className="field"><span>{tr('Type', 'प्रकार')}</span><Seg value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={KIND_OPTS(tr)} /></div>
      <label className="field"><span>{tr('Near which place', 'किस जगह के पास')}</span>
        <select value={f.near} onChange={(e) => setF({ ...f, near: e.target.value })}>
          <option value="">{tr('Not near a listed place', 'किसी सूचीबद्ध जगह के पास नहीं')}</option>
          {data.places.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
        </select>
      </label>
      <div className="field"><span>{tr('Where exactly (tap the map)', 'ठीक कहाँ (नक्शे पर टैप करें)')}</span>
        <Suspense fallback={<div className="map-picker" />}><MapPicker center={data.city.center} value={pin} tokens={tokens} onPick={setPin} /></Suspense>
      </div>
      <label className="field"><span>{tr('Hours, prices, what you offer', 'समय, कीमत, आप क्या देते हैं')}</span><textarea rows={4} maxLength={600} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} /></label>
      <label className="field"><span>{tr('Phone for customers', 'ग्राहकों के लिए फ़ोन')}</span><input inputMode="tel" maxLength={20} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
      <p className="small muted">{tr('Raahis see this as "provided by the owner". It is not part of Dishaara\'s checked data.', 'राही इसे "मालिक की दी जानकारी" के रूप में देखते हैं। यह दिशारा की जाँची गई जानकारी नहीं है।')}</p>
      {err && <p className="small error">{err}</p>}
      <button className="btn primary big" onClick={send}>{tr('Send for approval', 'मंज़ूरी के लिए भेजें')}</button>
    </LayerPage>
  );
}

function NoShop() {
  const { open } = useNav();
  const tr = useTr();
  return (
    <div className="screen">
      <h1 className="display small">{tr('Your business', 'आपका व्यवसाय')}</h1>
      <p className="muted">{tr('You have no shop listed yet.', 'अभी आपकी कोई दुकान सूची में नहीं।')}</p>
      <button className="btn primary" onClick={() => open({ kind: 'apply-biz' })}>{tr('List your shop', 'अपनी दुकान जोड़ें')}</button>
    </div>
  );
}

export function BusinessHome() {
  const { data } = useStore();
  const { open } = useNav();
  const { lang } = useTheme();
  const tr = useTr();
  const [b] = useMyShop();
  if (b === undefined) return <div className="screen"><p className="muted">{tr('Loading', 'लोड हो रहा है')}</p></div>;
  if (!b) return <NoShop />;
  const near = data.places.find((p) => p.id === b.near);
  return (
    <div className="screen">
      <p className="eyebrow">{tr('Business', 'व्यवसाय')} · {b.status === 'live' ? tr('listed in the Bazaar', 'बाज़ार में दिख रही है') : b.status === 'pending' ? tr('waiting for a moderator', 'मॉडरेटर की मंज़ूरी बाकी') : tr('not approved', 'मंज़ूर नहीं')}</p>
      <h1 className="display">{b.name}</h1>
      {near && <p className="muted small">{tr('Near', 'पास में')} {near.name[lang]}</p>}
      <div className="stat-grid">
        <div className="stat"><b>{b.visits ?? 0}</b><small>{tr('Raahi check-ins', 'राहियों की चेक-इन')}</small></div>
        <div className="stat"><b>{b.commentCount ?? 0}</b><small>{tr('Comments', 'टिप्पणियाँ')}</small></div>
        <div className="stat"><b>{b.followers ?? 0}</b><small>{tr('Followers', 'फ़ॉलोअर')}</small></div>
        <div className="stat"><b>{b.sponsored ? tr('Sponsored', 'प्रायोजित') : tr('Free', 'मुफ़्त')}</b><small>{tr('Your plan', 'आपका प्लान')}</small></div>
      </div>
      <button className="card row" onClick={() => open({ kind: 'look' })}>
        <Icon name="sparkle" size={22} /><span className="grow"><b>{tr('Your look', 'आपका रूप')}</b><small>{tr('Bazaar frames, banners and theme', 'बाज़ार फ़्रेम, बैनर और थीम')}</small></span><Icon name="arrow" size={16} />
      </button>
      <Section title={tr('How raahis see you', 'राही आपको कैसे देखते हैं')}>
        <div className={`biz card${b.sponsored ? ' sponsored' : ''}`}>
          <div className="biz-top"><b>{b.name}</b>{b.sponsored && <span className="spons">{tr('Sponsored', 'प्रायोजित')}</span>}</div>
          {b.details && <p className="small">{b.details}</p>}
          <span className="small muted">{tr('Provided by the owner, may vary', 'मालिक की दी जानकारी, बदल सकती है')}</span>
        </div>
      </Section>
    </div>
  );
}

export function BusinessEdit() {
  const { data } = useStore();
  const { lang, tokens } = useTheme();
  const tr = useTr();
  const [b, setB] = useMyShop();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (b === undefined) return <div className="screen"><p className="muted">{tr('Loading', 'लोड हो रहा है')}</p></div>;
  if (!b) return <NoShop />;
  const addPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    const r = await uploadShopPhoto(await shrink(f));
    setBusy(false);
    if (!r) return setNote(lastError);
    setB({ ...b, photos: r.photos });
  };
  const dropPhoto = (id: string) => api.deleteShopPhoto(id).then((r) => r ? setB({ ...b, photos: r.photos }) : setNote(lastError));
  const save = () => api.putBusiness({ name: b.name, details: b.details, phone: b.phone, near: b.near, lat: b.lat, lng: b.lng }).then((r) => {
    if (!r) return setNote(lastError);
    setB({ ...b, ...r });
    setNote(tr('Saved.', 'सेव हुआ।'));
  });
  return (
    <div className="screen">
      <h1 className="display small">{tr('My business page', 'मेरा व्यवसाय पेज')}</h1>
      <label className="field"><span>{tr('Name', 'नाम')}</span><input value={b.name} maxLength={80} onChange={(e) => setB({ ...b, name: e.target.value })} /></label>
      <label className="field"><span>{tr('Near which place', 'किस जगह के पास')}</span>
        <select value={b.near ?? ''} onChange={(e) => setB({ ...b, near: e.target.value })}>
          <option value="">{tr('Not near a listed place', 'किसी सूचीबद्ध जगह के पास नहीं')}</option>
          {data.places.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
        </select>
      </label>
      <div className="field"><span>{tr('Where exactly (tap the map)', 'ठीक कहाँ (नक्शे पर टैप करें)')}</span>
        <Suspense fallback={<div className="map-picker" />}><MapPicker center={data.city.center} value={b.lat != null && b.lng != null ? [b.lat, b.lng] : null} tokens={tokens} onPick={(c) => setB({ ...b, lat: c[0], lng: c[1] })} /></Suspense>
      </div>
      <label className="field"><span>{tr('Hours, prices, what you offer', 'समय, कीमत, आप क्या देते हैं')}</span><textarea rows={4} maxLength={600} value={b.details ?? ''} onChange={(e) => setB({ ...b, details: e.target.value })} /></label>
      <div className="field"><span>{tr('Photos of your shop (up to 6)', 'आपकी दुकान की फ़ोटो (6 तक)')}</span>
        <div className="proof-row">
          {(b.photos ?? []).map((id) => (
            <span key={id} className="shop-photo-edit">
              <img src={mediaUrl(id)} alt="" className="proof-thumb" />
              <button className="icon-btn" aria-label={tr('Remove photo', 'फ़ोटो हटाएँ')} onClick={() => dropPhoto(id)}><Icon name="x" size={14} /></button>
            </span>
          ))}
          {(b.photos?.length ?? 0) < 6 && (
            <label className="btn ghost">
              <Icon name="camera" size={18} /> {busy ? tr('Uploading', 'अपलोड हो रहा है') : tr('Add photo', 'फ़ोटो जोड़ें')}
              <input type="file" accept="image/*" hidden onChange={addPhoto} disabled={busy} />
            </label>
          )}
        </div>
      </div>
      <label className="field"><span>{tr('Phone for customers', 'ग्राहकों के लिए फ़ोन')}</span><input inputMode="tel" maxLength={20} value={b.phone ?? ''} onChange={(e) => setB({ ...b, phone: e.target.value })} /></label>
      <p className="small muted">{tr('Raahis see this as "provided by the owner". It is not part of Dishaara\'s checked data.', 'राही इसे "मालिक की दी जानकारी" के रूप में देखते हैं। यह दिशारा की जाँची गई जानकारी नहीं है।')}</p>
      <button className="btn primary big" onClick={save}><Icon name="check" size={18} /> {tr('Save', 'सेव करें')}</button>
      {note && <p className="small muted">{note}</p>}
    </div>
  );
}

export function BusinessComments() {
  const tr = useTr();
  const [b] = useMyShop();
  const [list, setList] = useState<ServerComment[] | null>(null);
  const [asked, setAsked] = useState('');
  useEffect(() => {
    api.businessComments().then((c) => setList(c ?? []));
  }, []);
  if (b === null) return <NoShop />;
  return (
    <div className="screen">
      <h1 className="display small">{tr('Comments', 'टिप्पणियाँ')}</h1>
      {list === null && <p className="muted">{tr('Loading', 'लोड हो रहा है')}</p>}
      {list?.map((c) => (
        <div key={c.id} className="card"><Icon name="chat" size={20} /><span className="grow"><b>{c.byName}</b> {c.text}</span></div>
      ))}
      {list?.length === 0 && <p className="muted">{tr('No comments yet.', 'अभी कोई टिप्पणी नहीं।')}</p>}
      <Section title={tr('Sponsor card', 'प्रायोजित कार्ड')} note={tr('Shows your card first on routes that pass you. Revenue helps keep the app free.', 'आपके पास से गुज़रने वाले रास्तों पर आपका कार्ड पहले दिखेगा। इससे ऐप मुफ़्त रहता है।')}>
        <button className="btn primary" disabled={!!asked} onClick={() => api.sponsorRequest().then((r) => setAsked(r ? tr('Requested. A moderator will reply.', 'अनुरोध भेजा। मॉडरेटर जवाब देंगे।') : lastError))}>{tr('Request a sponsor card', 'प्रायोजित कार्ड माँगें')}</button>
        {asked && <p className="small muted">{asked}</p>}
      </Section>
    </div>
  );
}
