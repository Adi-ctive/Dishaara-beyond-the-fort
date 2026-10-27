// The social side: the feed of saarthi and shop posts, a page per shop and per saarthi.
// Everything comes from the server. Guests can read. Liking, saving, commenting, following,
// reporting and check-ins need an account (useGate opens sign-in).
import { motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { api, apiOn, lastError, mediaUrl, type SaarthiPage as SaarthiData, type ServerComment, type ServerPost, type Shop } from '../api';
import { Avatar, Banner } from '../art/Avatars';
import { BizCover, BizIcon } from '../art/BizArt';
import { PlaceCover } from '../art/PlaceCover';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../ui/Icon';
import { LayerPage, Section, Seg } from '../ui/Layer';
import { useTr } from '../ui/tr';
import { useGate } from '../ui/SignIn';

const KIND_LABEL: Record<string, [string, string]> = {
  post: ['Post', 'पोस्ट'],
  question: ['Question', 'सवाल'],
  fact: ['Fact check', 'जाँच'],
  photo: ['Photo', 'फ़ोटो'],
  video: ['Video', 'वीडियो'],
  blog: ['Blog', 'ब्लॉग'],
  offer: ['Offer', 'ऑफ़र'],
};

const ago = (iso: string, hi: boolean) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).getTime()) / 60000));
  if (m < 60) return hi ? `${m} मिनट` : `${m} min`;
  if (m < 1440) return hi ? `${Math.round(m / 60)} घंटे` : `${Math.round(m / 60)} h`;
  return hi ? `${Math.round(m / 1440)} दिन` : `${Math.round(m / 1440)} d`;
};

/** A post from the server. Every action is checked there (one like each, rate limits, reports). */
export function LivePostCard({ post, i = 0, onChange }: { post: ServerPost; i?: number; onChange?: (p: ServerPost) => void }) {
  const { s, data } = useStore();
  const { lang } = useTheme();
  const { open } = useNav();
  const tr = useTr();
  const gate = useGate();
  const [p, setP] = useState(post);
  const [thread, setThread] = useState<ServerComment[] | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [sure, setSure] = useState(false);
  const [gone, setGone] = useState(false);
  const place = data.places.find((x) => x.id === p.place);
  const meId = s.user?.id;
  const canDelete = !!p.mine || !!s.user?.roles.includes('moderator');
  const remove = () => {
    if (!sure) return setSure(true); // first tap asks, second tap deletes
    api.deletePost(p.id).then((r) => (r ? setGone(true) : setNote(lastError)));
  };
  const dropComment = (id: string) => api.deleteComment(id).then((r) => {
    if (!r) return setNote(lastError);
    setThread((t) => (t ?? []).filter((c) => c.id !== id));
    setP((x) => ({ ...x, comments: Math.max(0, x.comments - 1) }));
  });
  const update = (n: ServerPost | null) => {
    if (!n) return setNote(lastError);
    setP(n);
    onChange?.(n);
  };
  const toggleThread = () => (thread ? setThread(null) : api.comments(p.id).then((c) => setThread(c ?? [])));
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!s.signedIn) return open({ kind: 'signin', as: 'raahi' });
    if (!text.trim()) return;
    api.comment(p.id, text.trim()).then((c) => {
      if (!c) return setNote(lastError);
      setThread((t) => [...(t ?? []), c]);
      setP((x) => ({ ...x, comments: x.comments + 1 }));
      setText('');
      setNote('');
    });
  };
  if (gone) return <p className="muted small post-gone">{tr('Post deleted.', 'पोस्ट हटाई गई।')}</p>;
  return (
    <motion.article className="post" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
      <header className="post-head">
        <button className="post-who" onClick={() => (p.biz ? open({ kind: 'biz', id: p.biz }) : p.byRole !== 'raahi' && open({ kind: 'saarthi', id: p.by }))}>
          {p.biz ? <span className="biz-kind shop"><BizIcon kind="shop" /></span> : <Avatar id="peacock" size={42} />}
          <span>
            <b>{p.byName}{(p.byRole === 'saarthi' || p.byRole === 'moderator') && <span className="verified" title={tr('Verified saarthi', 'सत्यापित सारथी')}><Icon name="check" size={10} /></span>}</b>
            <small>{p.byRole === 'business' ? tr('Shop, owner-provided', 'दुकान, मालिक की जानकारी') : p.byRole === 'raahi' ? tr('Raahi', 'राही') : p.byRole === 'moderator' ? tr('Dishaara team', 'दिशारा टीम') : tr('Verified saarthi', 'सत्यापित सारथी')} · {ago(p.at, lang === 'hi')}</small>
          </span>
        </button>
        <span className={`post-kind ${p.kind}`}>{tr(...(KIND_LABEL[p.kind] ?? ['Post', 'पोस्ट']))}</span>
      </header>
      <p className="post-text">{p.text}</p>
      {place && (
        <button className="post-place" onClick={() => open({ kind: 'place', id: place.id })}>
          <Icon name="pin" size={14} /> {place.name[lang]}
        </button>
      )}
      <footer className="post-actions">
        <button className={p.liked ? 'on' : ''} onClick={gate(() => api.like(p.id, !p.liked).then(update))} aria-pressed={!!p.liked}>
          <Icon name="thumb" size={18} /> {p.likes}
        </button>
        <button onClick={gate(toggleThread)}>
          <Icon name="chat" size={18} /> {p.comments}
        </button>
        <button className={p.saved ? 'on' : ''} onClick={gate(() => api.save(p.id, !p.saved).then(update))} aria-pressed={!!p.saved}>
          <Icon name="flag" size={18} /> {p.saved ? tr('Saved', 'सहेजा') : tr('Save', 'सहेजें')}
        </button>
        <button onClick={gate(() => api.report(p.id, 'post').then((r) => setNote(r ? tr('Reported. A moderator will look at it.', 'रिपोर्ट हुई। मॉडरेटर देखेंगे।') : lastError)))} aria-label={tr('Report', 'रिपोर्ट')}>
          <Icon name="shield" size={18} />
        </button>
        {canDelete && (
          <button className={sure ? 'danger' : ''} onClick={remove} onBlur={() => setSure(false)} aria-label={tr('Delete post', 'पोस्ट हटाएँ')}>
            <Icon name="x" size={18} /> {sure ? tr('Tap again to delete', 'हटाने के लिए फिर टैप करें') : tr('Delete', 'हटाएँ')}
          </button>
        )}
      </footer>
      {thread && (
        <div className="thread">
          {thread.map((c) => (
            <p key={c.id} className="small comment-row"><span className="grow"><b>{c.byName}</b> {c.text}</span>
              {meId && (c.by === meId || s.user?.roles.includes('moderator')) && (
                <button className="link-btn" onClick={() => dropComment(c.id)} aria-label={tr('Delete comment', 'टिप्पणी हटाएँ')}><Icon name="x" size={14} /></button>
              )}
            </p>
          ))}
          <form className="row-actions" onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={tr('Add a comment', 'टिप्पणी लिखें')} />
            <button className="btn primary">{tr('Send', 'भेजें')}</button>
          </form>
        </div>
      )}
      {note && <small className="muted">{note}</small>}
    </motion.article>
  );
}

/** Posts from the server for a tab, a place or one author. null while loading. */
export function useLiveFeed(q: { tab?: 'all' | 'following' | 'saved'; place?: string; by?: string }, refresh = 0) {
  const { s } = useStore();
  const [posts, setPosts] = useState<ServerPost[] | null>(null);
  const { tab, place, by } = q;
  useEffect(() => {
    if (!apiOn()) return;
    let alive = true;
    setPosts(null);
    api.feed({ tab, place, by }).then((p) => alive && setPosts(p ?? []));
    return () => {
      alive = false;
    };
  }, [tab, place, by, refresh, s.signedIn]);
  return posts;
}

/** The feed: everything, or only people the raahi follows, or only saved posts. */
export function Feed({ only, place, refresh = 0 }: { only?: string; place?: string; refresh?: number }) {
  const { s } = useStore();
  const tr = useTr();
  const gate = useGate();
  const [filter, setFilter] = useState<'all' | 'following' | 'saved'>('all');
  const live = useLiveFeed({ tab: only || place ? 'all' : filter, by: only, place }, refresh);
  const keep = useCallback(() => undefined, []);
  // Following and Saved belong to an account.
  const pick = (v: 'all' | 'following' | 'saved') => (v === 'all' || s.signedIn ? setFilter(v) : gate(() => setFilter(v))());
  return (
    <div className="feed">
      {!only && !place && (
        <Seg value={filter} onChange={pick} options={[{ v: 'all', label: tr('All', 'सब') }, { v: 'following', label: tr('Following', 'फ़ॉलो किए') }, { v: 'saved', label: tr('Saved', 'सहेजे') }]} />
      )}
      {!apiOn() && <p className="muted center-text">{tr('The feed needs the server.', 'फ़ीड के लिए सर्वर चाहिए।')}</p>}
      {apiOn() && live === null && <p className="muted center-text">{tr('Loading', 'लोड हो रहा है')}</p>}
      {live?.map((p, i) => (
        <LivePostCard key={p.id} post={p} i={i} onChange={keep} />
      ))}
      {live?.length === 0 && (
        <p className="muted center-text">
          {filter === 'following' ? tr('Follow a saarthi or a shop to see their posts here.', 'किसी सारथी या दुकान को फ़ॉलो करें।') : tr('No posts yet.', 'अभी कोई पोस्ट नहीं।')}
        </p>
      )}
    </div>
  );
}

const COMMUNITIES: { v: string; en: string; hi: string }[] = [
  { v: 'gwalior', en: 'Gwalior', hi: 'ग्वालियर' },
  { v: 'indore', en: 'Indore', hi: 'इंदौर' },
  { v: 'mp', en: 'Madhya Pradesh', hi: 'मध्य प्रदेश' },
  { v: 'india', en: 'India', hi: 'भारत' },
];
// What each account type posts. Facts are the saarthi's job, offers the shop's; everyone can talk and ask.
const KINDS_FOR: Record<string, string[]> = { raahi: ['post', 'question', 'blog'], saarthi: ['fact', 'post', 'question', 'blog', 'video'], business: ['offer', 'post', 'video'], moderator: ['post', 'fact', 'question'] };

/** One community space for every account type: city, state and national communities, newest or top first.
 * Anyone signed in posts; saarthi and shop posts carry their badge; everyone can like, comment, save and report. */
export function Community() {
  const { s, data } = useStore();
  const { lang } = useTheme();
  const tr = useTr();
  const gate = useGate();
  const [community, setCommunity] = useState<string>(s.city);
  const [sort, setSort] = useState<'new' | 'top'>('new');
  const [kind, setKind] = useState(KINDS_FOR[s.role][0]);
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [posts, setPosts] = useState<ServerPost[] | null>(null);
  const keep = useCallback(() => undefined, []);
  useEffect(() => {
    if (!apiOn()) return;
    setPosts(null);
    api.feed({ community, sort }).then((p) => setPosts(p ?? []));
  }, [community, sort, refresh, s.signedIn]);
  const post = gate(() => {
    if (!text.trim()) return;
    api.post({ kind: kind as 'post', text: text.trim(), placeId: place || undefined, city: s.city, community, as: s.role }).then((p) => {
      if (!p) return setNote(lastError);
      setText('');
      setNote('');
      setSort('new');
      setRefresh((r) => r + 1);
    });
  });
  return (
    <div className="feed community">
      <div className="chips">
        {COMMUNITIES.map((c) => (
          <button key={c.v} className={`chip${community === c.v ? ' on' : ''}`} onClick={() => setCommunity(c.v)}>{lang === 'hi' ? c.hi : c.en}</button>
        ))}
      </div>
      <div className="composer-card card col">
        <Seg value={kind} onChange={setKind} options={KINDS_FOR[s.role].map((k) => ({ v: k, label: tr(...(KIND_LABEL[k] ?? [k, k])) }))} />
        <textarea rows={2} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} onFocus={() => !s.signedIn && gate(() => undefined)()}
          placeholder={kind === 'question' ? tr('Ask the community', 'समुदाय से पूछें') : kind === 'fact' ? tr('What did you check, where and when?', 'क्या जाँचा, कहाँ और कब?') : tr('Share something', 'कुछ साझा करें')} />
        <div className="row-actions">
          <select value={place} onChange={(e) => setPlace(e.target.value)} aria-label={tr('Place', 'जगह')}>
            <option value="">{tr('No place', 'कोई जगह नहीं')}</option>
            {data.places.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
          </select>
          <button className="btn primary" onClick={post}>{tr('Post', 'पोस्ट')}</button>
        </div>
        {note && <small className="err">{note}</small>}
      </div>
      <Seg value={sort} onChange={setSort} options={[{ v: 'new', label: tr('New', 'नई') }, { v: 'top', label: tr('Top', 'टॉप') }]} />
      {apiOn() && posts === null && <p className="muted center-text">{tr('Loading', 'लोड हो रहा है')}</p>}
      {posts?.map((p, i) => <LivePostCard key={p.id} post={p} i={i} onChange={keep} />)}
      {posts?.length === 0 && <p className="muted center-text">{tr('No posts in this community yet. Be the first.', 'इस समुदाय में अभी कोई पोस्ट नहीं। पहले आप लिखें।')}</p>}
    </div>
  );
}

export function FeedPage() {
  const tr = useTr();
  return (
    <LayerPage title={tr('Community', 'समुदाय')}>
      <Community />
    </LayerPage>
  );
}

/** Follow a saarthi or a shop owner. One follow per person, counted on the server. */
function FollowButton({ id, on: start = false, onChange }: { id: string; on?: boolean; onChange?: (followers: number) => void }) {
  const tr = useTr();
  const gate = useGate();
  const [on, setOn] = useState(start);
  useEffect(() => setOn(start), [start]);
  return (
    <button className={`btn ${on ? 'ghost' : 'primary'} follow`} onClick={gate(() => {
        api.follow(id, !on).then((r) => {
          if (!r) return;
          setOn(r.following);
          onChange?.(r.followers);
        });
      })}>
      {on ? <><Icon name="check" size={16} /> {tr('Following', 'फ़ॉलो कर रहे हैं')}</> : <><Icon name="plus" size={16} /> {tr('Follow', 'फ़ॉलो करें')}</>}
    </button>
  );
}

/** Saarthi profile from the server: banner, avatar, region, followers, follow, their posts. */
export function SaarthiPage({ id }: { id: string }) {
  const tr = useTr();
  const { s } = useStore();
  const [sa, setSa] = useState<SaarthiData | null | undefined>(undefined);
  const [followers, setFollowers] = useState(0);
  useEffect(() => {
    api.saarthi(id).then((r) => {
      setSa(r);
      setFollowers(r?.followers ?? 0);
    });
  }, [id, s.signedIn]);
  if (sa === undefined) return <LayerPage title={tr('Saarthi', 'सारथी')}><p className="muted">{tr('Loading', 'लोड हो रहा है')}</p></LayerPage>;
  if (!sa) return <LayerPage title={tr('Saarthi', 'सारथी')}><p className="muted">{tr('This saarthi was not found.', 'यह सारथी नहीं मिला।')}</p></LayerPage>;
  return (
    <LayerPage title={sa.name}>
      <div className="hero">
        <Banner id={sa.banner ?? 'dusk'} height={120} />
        <div className="hero-row">
          <span className="hero-avatar"><Avatar id={sa.avatar ?? 'peacock'} frame={sa.frame ?? undefined} size={92} /></span>
          <div className="hero-text">
            <h1 className="display small">{sa.name} <span className="verified big"><Icon name="check" size={12} /></span></h1>
            <span className="level-pill">{sa.rank ?? tr('Saarthi', 'सारथी')}{sa.approved ? ` · ${sa.approved} ${tr('approved entries', 'मंज़ूर एंट्री')}` : ''}</span>
          </div>
        </div>
        <div className="hero-stats">
          <span><b>{followers}</b><small>{tr('followers', 'फ़ॉलोअर')}</small></span>
          <span><b>{sa.posts.length}</b><small>{tr('posts', 'पोस्ट')}</small></span>
          {sa.region && <span><b>{sa.region}</b><small>{tr('region', 'इलाका')}</small></span>}
        </div>
        <div className="hero-actions"><FollowButton id={sa.id} on={sa.following} onChange={setFollowers} /></div>
      </div>
      <Section title={tr('Posts', 'पोस्ट')}>
        {sa.posts.map((p, i) => <LivePostCard key={p.id} post={p} i={i} />)}
        {!sa.posts.length && <p className="muted small">{tr('No posts yet.', 'अभी कोई पोस्ट नहीं।')}</p>}
      </Section>
    </LayerPage>
  );
}

/** A Bazaar shop from the server: owner-provided details, map, comments, check-in, posts. */
export function BizView({ id }: { id: string }) {
  const { s, set, data } = useStore();
  const { lang } = useTheme();
  const { open, go, closeAll } = useNav();
  const tr = useTr();
  const gate = useGate();
  const [b, setB] = useState<Shop | null | undefined>(undefined);
  const [comments, setComments] = useState<ServerComment[]>([]);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    api.shop(id).then(setB);
    api.shopComments(id).then((c) => setComments(c ?? []));
  }, [id, s.signedIn]);
  if (b === undefined) return <LayerPage title={tr('Shop', 'दुकान')}><p className="muted">{tr('Loading', 'लोड हो रहा है')}</p></LayerPage>;
  if (!b) return <LayerPage title={tr('Shop', 'दुकान')}><p className="muted">{tr('This shop is not listed.', 'यह दुकान सूची में नहीं है।')}</p></LayerPage>;
  const near = data.places.find((p) => p.id === b.near);
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!s.signedIn) return open({ kind: 'signin', as: 'raahi' });
    if (!text.trim()) return;
    api.shopComment(b.id, text.trim()).then((c) => {
      if (!c) return setNote(lastError);
      setComments((x) => [c, ...x]);
      setText('');
      setNote('');
    });
  };
  const visit = gate(() => {
    api.shopVisit(b.id).then((r) => {
      if (!r) return setNote(lastError);
      setB({ ...b, visitedToday: true });
      if (r.points) set((c) => ({ points: c.points + r.points }));
    });
  });
  return (
    <LayerPage title={b.name}>
      <div className="biz-hero">
        {b.photos?.length ? <img className="biz-photo" src={mediaUrl(b.photos[0])} alt={b.name} style={{ height: 160 }} /> : <BizCover kind={b.kind} height={160} />}
        {b.sponsored && <span className="spons hero-spons">{tr('Sponsored', 'प्रायोजित')}</span>}
      </div>
      <div className="biz-head">
        <span className={`biz-kind ${b.kind} big`}><BizIcon kind={b.kind} size={28} /></span>
        <div className="grow">
          <h1 className="display small">{b.name}</h1>
          {near && <small className="muted">{tr('Near', 'पास में')} {near.name[lang]}</small>}
        </div>
        <FollowButton id={b.owner} on={b.following} />
      </div>
      <p className="owner-note"><Icon name="alert" size={14} /> {tr('Provided by the owner, may vary. Not checked by Dishaara.', 'मालिक की दी जानकारी, बदल सकती है। दिशारा ने नहीं जाँची।')}</p>
      {(b.photos?.length ?? 0) > 1 && (
        <div className="shop-gallery">{b.photos!.slice(1).map((id) => <a key={id} href={mediaUrl(id)} target="_blank" rel="noreferrer"><img src={mediaUrl(id)} alt="" loading="lazy" /></a>)}</div>
      )}
      {b.details && <div className="fact"><p className="fact-text">{b.details}</p></div>}
      {b.phone && <a className="btn ghost" href={`tel:${b.phone}`}>{b.phone}</a>}
      <div className="row-actions">
        {b.lat != null && <button className="btn primary" onClick={() => { set({ mapFocus: b.id }); closeAll(); go('map'); }}><Icon name="map" size={18} /> {tr('Show on map', 'नक्शे पर दिखाएँ')}</button>}
        <button className="btn ghost" disabled={b.visitedToday} onClick={visit}>
          <Icon name="check" size={18} /> {b.visitedToday ? tr('Visited today', 'आज गए') : tr('I visited · +5', 'मैं गया · +5')}
        </button>
      </div>
      {note && <small className="muted">{note}</small>}
      {near && (
        <button className="card row" onClick={() => open({ kind: 'place', id: near.id })}>
          <span className="stop-thumb"><PlaceCover id={near.id} height={54} /></span>
          <span className="grow"><b>{near.name[lang]}</b><small>{tr('The place it is near', 'पास की जगह')}</small></span>
          <Icon name="arrow" size={16} />
        </button>
      )}
      <Section title={tr('Comments', 'टिप्पणियाँ')} note={tr('Short notes from raahis. No star ratings.', 'राहियों के छोटे नोट। स्टार रेटिंग नहीं।')}>
        <form className="row-actions" onSubmit={send}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={tr('Add a short note', 'छोटा नोट लिखें')} aria-label="Comment" />
          <button className="btn primary" type="submit">{tr('Post', 'भेजें')}</button>
        </form>
        {comments.map((c) => <div key={c.id} className="comment"><Icon name="chat" size={16} /> <b>{c.byName}</b> {c.text}</div>)}
        {!comments.length && <p className="muted small">{tr('No comments yet.', 'अभी कोई टिप्पणी नहीं।')}</p>}
      </Section>
      <Section title={tr('Posts', 'पोस्ट')}>
        <Feed only={b.owner} />
      </Section>
    </LayerPage>
  );
}
