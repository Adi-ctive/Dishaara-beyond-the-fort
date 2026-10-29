import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { api, apiOn, lastError, uploadProof, type EventEntry } from '../api';
import { LABELS, isUnavailable, type Label } from '../core';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme/ThemeProvider';
import { LABEL_TEXT } from '../ui/facts';
import { Icon } from '../ui/Icon';
import { Section, Seg } from '../ui/Layer';
import { useTr } from '../ui/tr';
import { Community } from './Social';

type Me = Awaited<ReturnType<typeof api.saarthiMe>>;

/** This saarthi's real counts from the server. */
function useSaarthiMe(refresh = 0) {
  const [me, setMe] = useState<Me | undefined>(undefined);
  useEffect(() => {
    api.saarthiMe().then(setMe);
  }, [refresh]);
  return me;
}

const STATUS: Record<string, [string, string]> = { open: ['open', 'खुला'], answered: ['answered', 'जवाब दिया'], escalated: ['escalated', 'आगे भेजा'] };
const RISK: Record<string, [string, string]> = { high: ['high risk', 'ज़्यादा जोखिम'], low: ['low risk', 'कम जोखिम'] };

// A2: saarthi dashboard. Counts come from the server; "to check" comes from the city record itself.
export function SaarthiHome() {
  const { s, set } = useStore();
  const { lang } = useTheme();
  const { go } = useNav();
  const tr = useTr();
  const me = useSaarthiMe();
  // The same work list the form shows, from the server.
  const [todo, setTodo] = useState<Awaited<ReturnType<typeof api.saarthiTodo>> | undefined>(undefined);
  useEffect(() => {
    api.saarthiTodo(s.city).then((t) => setTodo(t ?? []));
  }, [s.city]);
  const openPlace = (id: string) => {
    set({ saarthiPlace: id });
    go('s-form');
  };
  const tiles = [
    { n: todo?.reduce((k, t) => k + t.items.length, 0) ?? '…', l: tr('Facts to collect', 'जुटाने वाले तथ्य'), go: () => go('s-form') },
    { n: me?.toVerify ?? '…', l: tr('Entries to verify', 'जाँचने वाली एंट्री'), go: () => go('s-verify') },
    { n: me?.openTickets ?? '…', l: tr('Open tickets', 'खुले टिकट'), go: () => go('s-tickets') },
    { n: me?.followers ?? '…', l: tr('Followers', 'फ़ॉलोअर'), go: () => go('s-posts') },
  ];
  return (
    <div className="screen">
      <p className="eyebrow">{tr('Saarthi', 'सारथी')}</p>
      <h1 className="display">{tr('Namaste', 'नमस्ते')}{me?.name ? `, ${me.name}` : ''}</h1>
      {me && <p className="muted small">{me.region || tr('No region yet', 'अभी कोई इलाका नहीं')} · {me.checks} {tr('checks', 'जाँच')}</p>}
      {me === null && <p className="small error">{lastError || tr('Could not load your saarthi account.', 'आपका सारथी अकाउंट लोड नहीं हुआ।')}</p>}
      <div className="stat-grid">
        {tiles.map((t, i) => (
          <motion.button key={t.l} className="stat" onClick={t.go} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <b>{t.n}</b>
            <small>{t.l}</small>
          </motion.button>
        ))}
      </div>
      <button className="card row feed-teaser" onClick={() => go('s-posts')}>
        <Icon name="users" size={22} /><span className="grow"><b>{tr('Feed and my posts', 'फ़ीड और मेरी पोस्ट')}</b><small>{tr('What other saarthis and shops are posting', 'दूसरे सारथी और दुकानें क्या पोस्ट कर रहे हैं')}</small></span><Icon name="arrow" size={16} />
      </button>
      <Section title={tr('Most needed checks', 'सबसे ज़रूरी जाँच')} note={tr('Tap a place to see exactly which facts are missing and fill them in.', 'कौन से तथ्य बाकी हैं देखने और भरने के लिए जगह पर टैप करें।')}>
        {todo === undefined && <p className="muted small">{tr('Loading', 'लोड हो रहा है')}</p>}
        {todo?.slice(0, 6).map((t) => (
          <button key={t.place} className="card row" onClick={() => openPlace(t.place)}>
            <Icon name="clock" size={20} />
            <span className="grow"><b>{t.name}</b><small>{t.items.slice(0, 4).map((i) => (i.unitName ? `${i.unitName}: ${i.field}` : i.field)).join(', ')}{t.items.length > 4 ? ` +${t.items.length - 4}` : ''}</small></span>
            <span className="pts">{t.items.length}</span>
          </button>
        ))}
        {todo?.length === 0 && <p className="muted small">{tr('Every key fact in this city is on record.', 'इस शहर के सभी मुख्य तथ्य दर्ज हैं।')}</p>}
      </Section>
    </div>
  );
}

const FIELDS: [string, string][] = [
  ['Opening hours', 'खुलने का समय'],
  ['Weekly closing', 'साप्ताहिक बंदी'],
  ['Ticket prices', 'टिकट की कीमत'],
  ['Last entry', 'आख़िरी प्रवेश'],
  ['Payment', 'भुगतान'],
  ['Dress rules', 'पहनावे के नियम'],
  ['Accessibility', 'पहुँच'],
  ['Facilities', 'सुविधाएँ'],
  ["Do and don't", 'क्या करें, क्या नहीं'],
  ['Safety note', 'सुरक्षा नोट'],
  ['Good to know', 'जानने लायक'],
  ['Things to do', 'क्या करें'],
  ['Event', 'आयोजन (मेला, त्योहार, मौसम)'],
];
// Entries about the whole city (place "city"): how to get around, and notices that affect many places.
const CITY_FIELDS: [string, string][] = [
  ['Getting around', 'आना-जाना'],
  ['City notice', 'शहर की सूचना'],
  ['Event', 'आयोजन (मेला, त्योहार, मौसम)'],
];

/** Shrinks a phone photo to at most 1600 px on the long side, as JPEG, so it stays under the 2 MB limit. */
export async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.8));
}

/** A photo, voice note or clip attached as proof. */
export function ProofThumb({ url, type }: { url: string; type: string }) {
  if (type.startsWith('audio/')) return <audio className="proof-audio" src={url} controls preload="none" />;
  if (type.startsWith('video/')) return <video className="proof-thumb" src={url} controls preload="metadata" />;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Proof" className="proof-thumb" /></a>;
}

// The saarthi's own entries with their review status. Photos or clips can be added while an entry still waits,
// so a report filed from notes on the day gets its proof once the photos are off the phone.
function MyEntries({ refresh }: { refresh: string }) {
  const { data } = useStore();
  const { lang } = useTheme();
  const tr = useTr();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.myFacts>>>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const load = () => api.myFacts().then(setRows);
  useEffect(() => {
    load();
  }, [refresh]);
  const attach = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(id);
    const ids: string[] = [];
    for (const f of files.slice(0, 5)) {
      if (!f.type.startsWith('image/') && f.size > 4_000_000) {
        setNote(tr(`${f.name} is over 4 MB. Send a shorter clip.`, `${f.name} 4 MB से बड़ी है। छोटी क्लिप भेजें।`));
        continue;
      }
      const pid = f.type.startsWith('image/') ? await uploadProof(await shrink(f)) : await uploadProof(f, f.name || 'clip');
      if (pid) ids.push(pid);
      else setNote(lastError);
    }
    if (ids.length && (await api.addProofLater(id, ids))) setNote(tr(`Added ${ids.length} to the entry.`, `एंट्री में ${ids.length} जोड़े।`));
    setBusy(null);
    load();
  };
  if (!rows?.length) return null;
  const STATUS: Record<string, [string, string]> = { review: ['With a moderator', 'मॉडरेटर के पास'], pending: ['With a saarthi', 'सारथी के पास'], approved: ['Approved', 'मंज़ूर'], flagged: ['Flagged', 'फ़्लैग'], rejected: ['Rejected', 'नामंज़ूर'] };
  return (
    <Section title={tr('My entries', 'मेरी एंट्री')} note={tr('Add photos or short clips to an entry while it waits for review.', 'समीक्षा से पहले एंट्री में फ़ोटो या छोटी क्लिप जोड़ें।')}>
      {note && <p className="small muted">{note}</p>}
      {rows.map((v) => {
        const open = v.status === 'review' || v.status === 'pending';
        const where = v.place === 'city' ? tr('Whole city', 'पूरा शहर') : data.places.find((p) => p.id === v.place)?.name[lang] ?? v.place;
        return (
          <div key={v.id} className="card col my-entry" data-entry={v.id}>
            <b>{where} · {v.field}</b>
            <small>{v.value}</small>
            <span className="row-actions">
              <span className="small muted">{tr(...(STATUS[v.status] ?? [v.status, v.status]))} · {v.proofCount} {tr('proof', 'सबूत')}</span>
              {open && (
                <label className="btn ghost small">
                  {busy === v.id ? tr('Uploading…', 'अपलोड हो रहा…') : tr('Add photo or video', 'फ़ोटो या वीडियो जोड़ें')}
                  <input type="file" accept="image/*,video/*,audio/*" multiple hidden onChange={(e) => attach(v.id, e)} disabled={busy !== null} />
                </label>
              )}
            </span>
          </div>
        );
      })}
    </Section>
  );
}

// A3: what to collect (every missing or weak fact, from the database), and the form, field by field.
// In a saarthi's first week each entry goes to a moderator; after that, to another saarthi of the region.
export function SaarthiForm() {
  const { s, set, data } = useStore();
  const { lang } = useTheme();
  const tr = useTr();
  const [todo, setTodo] = useState<Awaited<ReturnType<typeof api.saarthiTodo>> | undefined>(undefined);
  const [place, setPlace] = useState(s.saarthiPlace ?? data.places[0].id);
  const [openId] = useState(s.saarthiPlace);
  useEffect(() => {
    if (s.saarthiPlace) set({ saarthiPlace: null });
  }, [s.saarthiPlace, set]);
  const [field, setField] = useState(FIELDS[0][0]);
  const [unit, setUnit] = useState<string | null>(null);
  const [label, setLabel] = useState<Label>('locally verified');
  const [value, setValue] = useState('');
  // Event entries: a fair, festival or season. Dates can be last year's for a yearly event: the app learns the pattern.
  const [ev, setEv] = useState<EventEntry>({ name: '', start: '', end: '', recurring: 'yearly', where: '', watch: '' });
  const [proofs, setProofs] = useState<{ id: string; url: string; type: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  useEffect(() => {
    api.saarthiTodo(s.city).then((t) => setTodo(t ?? []));
  }, [s.city, sent]);
  const pick = (pid: string, f: string, u: string | null) => {
    setPlace(pid);
    setField(f);
    setUnit(u);
    setSent('');
    document.getElementById('saarthi-form')?.scrollIntoView({ behavior: 'smooth' });
  };
  const addPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    const id = await uploadProof(await shrink(f));
    setBusy(false);
    if (!id) return setSent(lastError);
    setProofs((p) => [...p, { id, url: URL.createObjectURL(f), type: 'image/jpeg' }]);
  };
  const addClip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 4_000_000) return setSent(tr('That file is over 4 MB. Record a shorter clip (about 20 seconds of video or 2 minutes of voice).', 'फ़ाइल 4 MB से बड़ी है। छोटी क्लिप रिकॉर्ड करें (लगभग 20 सेकंड वीडियो या 2 मिनट आवाज़)।'));
    setBusy(true);
    const id = await uploadProof(f, f.name || 'clip');
    setBusy(false);
    if (!id) return setSent(lastError);
    setProofs((p) => [...p, { id, url: URL.createObjectURL(f), type: f.type }]);
  };
  const send = async () => {
    if (!value.trim()) return setSent(tr('Write what you saw first.', 'पहले लिखें आपने क्या देखा।'));
    const isEvent = field === 'Event';
    if (isEvent && (ev.name.trim().length < 3 || !ev.start)) return setSent(tr('An event needs a name and a start date.', 'आयोजन का नाम और शुरू होने की तारीख़ ज़रूरी है।'));
    const event = isEvent ? { ...ev, name: ev.name.trim(), end: ev.end || undefined, where: ev.where?.trim(), watch: ev.watch?.trim() } : undefined;
    const r = await api.addFact({ placeId: place, city: place === 'city' ? s.city : undefined, unitId: unit, field, value: value.trim(), label, proof: proofs.map((p) => p.id), event });
    if (!r) return setSent(lastError || tr('Could not send. Try again.', 'नहीं भेजा जा सका। फिर कोशिश करें।'));
    setValue('');
    setProofs([]);
    setSent(r.route === 'moderator'
      ? tr('Sent to a moderator. In your first week every entry is approved by a moderator.', 'मॉडरेटर को भेजा। पहले हफ़्ते में हर एंट्री मॉडरेटर मंज़ूर करते हैं।')
      : tr('Sent to another saarthi of the region to verify.', 'इलाके के दूसरे सारथी को जाँचने भेजा।'));
  };
  const placeName = (id: string) => data.places.find((p) => p.id === id)?.name[lang] ?? id;
  return (
    <div className="screen">
      <h1 className="display small">{tr('Add or update data', 'जानकारी जोड़ें या बदलें')}</h1>
      <Section title={tr('What to collect', 'क्या जुटाना है')} note={tr('Every fact still missing or not certain in this city. Tap one to fill it in.', 'इस शहर के सभी अनजान या अपक्के तथ्य। भरने के लिए टैप करें।')}>
        {todo === undefined && <p className="muted">{tr('Loading', 'लोड हो रहा है')}</p>}
        {todo?.length === 0 && <p className="muted">{tr('Nothing missing in this city.', 'इस शहर में कुछ बाकी नहीं।')}</p>}
        {todo?.map((t) => (
          <details key={t.place} className="todo-place" open={t.place === openId}>
            <summary><b>{placeName(t.place)}</b> <small className="muted">{t.items.length} {tr('to collect', 'बाकी')}</small></summary>
            {t.items.map((i) => (
              <button key={`${i.unit}-${i.field}`} className="card row todo-item" onClick={() => pick(t.place, i.field, i.unit)} disabled={i.waiting}>
                <span className="grow">
                  <b>{i.unitName ? `${i.unitName}: ` : ''}{tr(i.field, FIELDS.find((f) => f[0] === i.field)?.[1] ?? i.field)}</b>
                  <small>{i.waiting ? tr('An entry is waiting for a check', 'एक एंट्री जाँच के इंतज़ार में') : i.state === 'missing' ? tr('Not known yet', 'अभी पता नहीं') : `${LABEL_TEXT[i.state as Label]?.[lang] ?? i.state}${i.now ? `: ${i.now}` : ''}`}</small>
                </span>
                {!i.waiting && <Icon name="edit" size={16} />}
              </button>
            ))}
          </details>
        ))}
      </Section>
      <MyEntries refresh={sent} />
      <div id="saarthi-form" />
      <label className="field"><span>{tr('Place', 'जगह')}</span>
        <select value={place} onChange={(e) => { setPlace(e.target.value); setUnit(null); setField(e.target.value === 'city' ? CITY_FIELDS[0][0] : FIELDS[0][0]); }}>
          <option value="city">{tr('Whole city: getting around, notices, events', 'पूरा शहर: आना-जाना, सूचनाएँ, आयोजन')}</option>
          {data.places.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
        </select>
      </label>
      {(data.places.find((p) => p.id === place)?.units.length ?? 1) > 1 && (
        <label className="field"><span>{tr('Which part', 'कौन सा हिस्सा')}</span>
          <select value={unit ?? ''} onChange={(e) => setUnit(e.target.value || null)}>
            <option value="">{tr('The whole place', 'पूरी जगह')}</option>
            {data.places.find((p) => p.id === place)!.units.map((u) => <option key={u.id} value={u.id}>{u.name[lang]}</option>)}
          </select>
        </label>
      )}
      <label className="field"><span>{tr('Template field', 'टेम्पलेट का हिस्सा')}</span>
        <select value={field} onChange={(e) => setField(e.target.value)}>
          {(place === 'city' ? CITY_FIELDS : FIELDS).map(([en, hi]) => <option key={en} value={en}>{tr(en, hi)}</option>)}
        </select>
      </label>
      {field === 'Event' && (
        <div className="event-form">
          <label className="field"><span>{tr('Event name', 'आयोजन का नाम')}</span><input value={ev.name} maxLength={80} onChange={(e) => setEv({ ...ev, name: e.target.value })} placeholder={tr('Gwalior Trade Fair', 'ग्वालियर व्यापार मेला')} /></label>
          <div className="row2">
            <label className="field"><span>{tr('Starts', 'शुरू')}</span><input type="date" value={ev.start} onChange={(e) => setEv({ ...ev, start: e.target.value })} /></label>
            <label className="field"><span>{tr('Ends', 'ख़त्म')}</span><input type="date" value={ev.end} min={ev.start} onChange={(e) => setEv({ ...ev, end: e.target.value })} /></label>
          </div>
          <label className="field"><span>{tr('How often', 'कितनी बार')}</span>
            <select value={ev.recurring} onChange={(e) => setEv({ ...ev, recurring: e.target.value as EventEntry['recurring'] })}>
              <option value="yearly">{tr('Every year, about the same dates', 'हर साल, लगभग इन्हीं तारीख़ों पर')}</option>
              <option value="yearly-lunar">{tr('Every year, date follows the Hindu calendar', 'हर साल, तारीख़ हिंदू पंचांग से')}</option>
              <option value="once">{tr('Only this once', 'सिर्फ़ इस बार')}</option>
              <option value="moving">{tr('Moves between cities or venues', 'शहर या जगह बदलता है')}</option>
            </select>
          </label>
          <label className="field"><span>{tr('Where', 'कहाँ')}</span><input value={ev.where} maxLength={120} onChange={(e) => setEv({ ...ev, where: e.target.value })} /></label>
          <label className="field"><span>{tr('How to keep an eye out for the next one', 'अगली बार की ख़बर कैसे मिले')}</span><input value={ev.watch} maxLength={200} onChange={(e) => setEv({ ...ev, watch: e.target.value })} placeholder={tr('Organiser, notice board, newspaper, website', 'आयोजक, सूचना बोर्ड, अख़बार, वेबसाइट')} /></label>
          <small className="muted">{tr("Past events help too: last year's dates let the app tell raahis when it is likely to happen again.", 'पुराने आयोजन भी काम के हैं: पिछले साल की तारीख़ों से ऐप राहियों को बता पाता है कि यह फिर कब होने की संभावना है।')}</small>
        </div>
      )}
      <label className="field"><span>{field === 'Event' ? tr('What happens there', 'वहाँ क्या होता है') : tr('What you saw', 'आपने क्या देखा')}</span><textarea rows={3} value={value} maxLength={500} onChange={(e) => setValue(e.target.value)} placeholder={tr('Write exactly what the board or the counter says, for example "9 am to 5 pm, closed Monday"', 'बोर्ड या काउंटर पर जो लिखा है वही लिखें, जैसे "सुबह 9 से शाम 5, सोमवार बंद"')} /></label>
      <label className="field"><span>{tr('How do you know?', 'आपको कैसे पता?')}</span>
        <select value={label} onChange={(e) => setLabel(e.target.value as Label)}>
          {LABELS.map((l) => <option key={l} value={l}>{LABEL_TEXT[l][lang]}</option>)}
        </select>
      </label>
      <div className="field"><span>{tr('Proof (photo of the board, ticket or counter; or a voice note or short video)', 'सबूत (बोर्ड, टिकट या काउंटर की फ़ोटो; या आवाज़ या छोटा वीडियो)')}</span>
        <div className="proof-row">
          {proofs.map((p) => <ProofThumb key={p.id} url={p.url} type={p.type} />)}
          <label className="btn ghost">
            <Icon name="camera" size={18} /> {busy ? tr('Uploading', 'अपलोड हो रहा है') : tr('Add photo', 'फ़ोटो जोड़ें')}
            <input type="file" accept="image/*" capture="environment" hidden onChange={addPhoto} disabled={busy || proofs.length >= 5} />
          </label>
          <label className="btn ghost">
            <Icon name="mic" size={18} /> {tr('Voice or video', 'आवाज़ या वीडियो')}
            <input type="file" accept="audio/*,video/*" hidden onChange={addClip} disabled={busy || proofs.length >= 5} />
          </label>
        </div>
        <small className="muted">{tr('Up to 5 files. Photos are shrunk on your phone. Clips up to 4 MB.', '5 फ़ाइल तक। फ़ोटो फ़ोन पर छोटी होती हैं। क्लिप 4 MB तक।')}</small>
      </div>
      <p className="small muted">{tr('Date and your name are stamped automatically. In your first week a moderator approves each entry; after that another saarthi of the region checks it. Once approved it updates the place for everyone.', 'तारीख और आपका नाम अपने-आप जुड़ते हैं। पहले हफ़्ते में हर एंट्री मॉडरेटर मंज़ूर करते हैं; उसके बाद इलाके का दूसरा सारथी जाँचता है। मंज़ूरी के बाद सबके लिए जगह अपडेट होती है।')}</p>
      <button className="btn primary big" onClick={send} disabled={busy}>{tr('Send for checking', 'जाँच के लिए भेजें')}</button>
      {sent && <p className="small">{sent}</p>}
    </div>
  );
}

// A4: verify another saarthi's entry.
export function SaarthiVerify() {
  const { data } = useStore();
  const { lang } = useTheme();
  const tr = useTr();
  const [done, setDone] = useState<Record<string, 'ok' | 'flag'>>({});
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof api.verifyQueue>>>(null);
  useEffect(() => {
    api.verifyQueue().then((q) => setQueue(q ?? []));
  }, []);
  const decide = (id: string, ok: boolean) => {
    setDone((d) => ({ ...d, [id]: ok ? 'ok' : 'flag' }));
    api.verify(id, ok);
  };
  return (
    <div className="screen">
      <h1 className="display small">{tr('Verify entries', 'एंट्री जाँचें')}</h1>
      <p className="muted small">{tr("From other saarthis in your region. You can't verify your own.", 'आपके इलाके के दूसरे सारथियों की। अपनी एंट्री आप नहीं जाँच सकते।')}</p>
      {queue === null && <p className="muted">{tr('Loading', 'लोड हो रहा है')}</p>}
      {queue?.length === 0 && <p className="muted">{tr('Nothing to verify right now.', 'अभी जाँचने को कुछ नहीं।')}</p>}
      {queue?.map((v) => (
        <div key={v.id} className={`card col${done[v.id] ? ' dim' : ''}`}>
          <div className="biz-top"><b>{v.place === 'city' ? tr('Whole city', 'पूरा शहर') : data.places.find((p) => p.id === v.place)?.name[lang]} · {tr(v.field, [...FIELDS, ...CITY_FIELDS].find((f) => f[0] === v.field)?.[1] ?? v.field)}</b><span className={`risk ${v.risk}`}>{tr(...(RISK[v.risk] ?? [v.risk, v.risk]))}</span></div>
          <p>{v.value}</p>
          <small className="muted">{tr('by', 'द्वारा')} {v.by}</small>
          {done[v.id] ? (
            <p className="small"><b>{done[v.id] === 'ok' ? tr('Approved', 'मंज़ूर') : tr('Flagged for a moderator', 'मॉडरेटर को भेजा')}</b></p>
          ) : (
            <div className="row-actions">
              <button className="btn primary" onClick={() => decide(v.id, true)}><Icon name="check" size={16} /> {tr('Matches what I know', 'मेरी जानकारी से मेल खाता है')}</button>
              <button className="btn ghost" onClick={() => decide(v.id, false)}><Icon name="flag" size={16} /> {tr('Flag', 'फ़्लैग')}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// A5: tickets for my region.
export function SaarthiTickets() {
  const { s, set, data } = useStore();
  const { lang } = useTheme();
  const tr = useTr();
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    api.tickets().then((t) => t && set({ tickets: t }));
  }, [set]);
  const answer = (id: string) => {
    const text = draft[id] || tr('Checked on site.', 'मौके पर जाँचा।');
    api.answerTicket(id, text);
    set((c) => ({ tickets: c.tickets.map((x) => (x.id === id ? { ...x, status: 'answered', answer: text } : x)) }));
  };
  const escalate = (id: string) => {
    api.answerTicket(id, '', true);
    set((c) => ({ tickets: c.tickets.map((x) => (x.id === id ? { ...x, status: 'escalated' } : x)) }));
  };
  return (
    <div className="screen">
      <h1 className="display small">{tr('Tickets', 'टिकट')}</h1>
      {!s.tickets.length && <p className="muted">{tr('No tickets right now.', 'अभी कोई टिकट नहीं।')}</p>}
      {s.tickets.map((t) => (
        <div key={t.id} className="card col">
          <div className="biz-top"><b>{data.places.find((p) => p.id === t.place)?.name[lang]}</b><span className={`status ${t.status}`}>{tr(...(STATUS[t.status] ?? [t.status, t.status]))}</span></div>
          <p>{t.text}</p>
          <small className="muted">{t.from}{t.proof && ` · ${tr(`${t.proof} attached`, `${t.proof} संलग्न`)}`}</small>
          {t.answer && <p className="answer">{t.answer}</p>}
          {t.status === 'open' && (
            <div className="row-actions">
              <input placeholder={tr('Answer', 'जवाब')} value={draft[t.id] ?? ''} onChange={(e) => setDraft({ ...draft, [t.id]: e.target.value })} />
              <button className="btn primary" onClick={() => answer(t.id)}>{tr('Answer', 'जवाब दें')}</button>
              <button className="btn ghost" onClick={() => escalate(t.id)}>{tr('Escalate', 'आगे भेजें')}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// A6 + A7: the shared community (saarthi posts carry the verified badge) and the saarthi's record.
export function SaarthiPosts() {
  const { open } = useNav();
  const { s } = useStore();
  const tr = useTr();
  const me = useSaarthiMe();
  return (
    <div className="screen">
      <h1 className="display small">{tr('Community', 'समुदाय')}</h1>
      <div className="stat-grid">
        <div className="stat"><b>{me?.checks ?? '…'}</b><small>{tr('Entries checked', 'जाँची एंट्री')}</small></div>
        <div className="stat"><b>{me?.followers ?? '…'}</b><small>{tr('Followers', 'फ़ॉलोअर')}</small></div>
      </div>
      <button className="card row" onClick={() => open({ kind: 'look' })}>
        <Icon name="sparkle" size={22} /><span className="grow"><b>{tr('Your look', 'आपका रूप')}</b><small>{tr('Saarthi frames and banners', 'सारथी फ़्रेम और बैनर')}</small></span><Icon name="arrow" size={16} />
      </button>
      {s.user && (
        <button className="card row" onClick={() => open({ kind: 'saarthi', id: s.user!.id })}>
          <Icon name="user" size={22} /><span className="grow"><b>{tr('See my public profile', 'मेरी सार्वजनिक प्रोफ़ाइल')}</b><small>{tr('What raahis see', 'राही क्या देखते हैं')}</small></span><Icon name="arrow" size={16} />
        </button>
      )}
      <Community />
    </div>
  );
}
