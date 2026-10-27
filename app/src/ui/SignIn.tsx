// Sign-in starts by asking who you are: traveller (raahi), saarthi, business or Dishaara team.
// That choice opens that account type's own app. Raahis, saarthis and businesses use Google;
// the team uses username and password. Partners without the role yet are taken to their application.
// An account holding several roles can move between them from Settings ("Use Dishaara as").
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiOn, lastError, type Me } from '../api';
import { Avatar } from '../art/Avatars';
import { useNav } from '../nav';
import { useStore, type Role } from '../store';
import { Icon } from './Icon';
import { LayerPage } from './Layer';
import { useTr } from './tr';

/** guard(fn): runs fn when signed in, otherwise opens the sign-in page. */
export function useGate() {
  const { s } = useStore();
  const { open } = useNav();
  return useCallback(
    (fn: () => void) => () => {
      if (s.signedIn) fn();
      else open({ kind: 'signin', as: 'raahi' });
    },
    [s.signedIn, open],
  );
}

type GoogleId = {
  accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } };
};

/** Google's own button (Google Identity Services). Loads its script once. */
// Google allows initialize() once per page: later calls can drop the sign-in callback. So it is set up
// once, and the callback reads the latest handler from a ref.
let googleReady: string | null = null;
const googleHandler: { current: ((credential: string) => void) | null } = { current: null };

function GoogleButton({ clientId, onUser }: { clientId: string; onUser: (u: Me | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  googleHandler.current = (credential) => api.signInGoogle(credential).then(onUser);
  useEffect(() => {
    const draw = () => {
      const g = (window as unknown as { google?: GoogleId }).google;
      if (!g || !box.current) return;
      if (googleReady !== clientId) {
        g.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => googleHandler.current?.(r.credential) });
        googleReady = clientId;
      }
      g.accounts.id.renderButton(box.current, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'continue_with', width: 280 });
    };
    if ((window as unknown as { google?: GoogleId }).google) return draw();
    let s = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (!s) {
      s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener('load', draw);
    return () => s?.removeEventListener('load', draw);
  }, [clientId]);
  return <div ref={box} className="gsi-box" />;
}

export function SignInCard({ compact = false, team = false, onUser }: { compact?: boolean; team?: boolean; onUser?: (u: Me) => void }) {
  const { set } = useStore();
  const tr = useTr();
  const [google, setGoogle] = useState<string | null>(null);
  const [demo, setDemo] = useState(!apiOn());
  const staff = team;
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.health().then((h) => {
      if (!h) return;
      setGoogle(h.google);
      setDemo(h.demoLogin);
    });
  }, []);

  const done = useCallback(
    (u: Me | null) => {
      setBusy(false);
      if (!u) return setErr(lastError || tr('Sign-in failed. Try again.', 'साइन इन नहीं हुआ। फिर कोशिश करें।'));
      set((c) => ({ signedIn: true, user: u, points: Math.max(c.points, u.points ?? 0), look: { avatar: u.avatar ?? c.look.avatar, frame: u.frame ?? c.look.frame, banner: u.banner ?? c.look.banner } }));
      onUser?.(u);
    },
    [set, tr, onUser],
  );

  const demoSignIn = () => {
    if (!apiOn()) return set({ signedIn: true });
    setBusy(true);
    api.signInDemo('Raahi').then(done);
  };
  const staffSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    api.signInStaff(user.trim(), pw).then((u) => {
      setPw('');
      done(u);
    });
  };

  return (
    <div className={`signin-card${compact ? ' compact' : ''}`}>
      {!compact && <Avatar id="peacock" size={84} />}
      <b>{tr('Sign in to collect and share', 'इकट्ठा करने और साझा करने के लिए साइन इन करें')}</b>
      <p className="small muted">
        {tr(
          'Stamps, points, badges, feedback, comments, follows and posts need an account, so we know who wrote what and can trust it. Planning your day works without one.',
          'स्टैम्प, पॉइंट, बैज, फ़ीडबैक, टिप्पणी, फ़ॉलो और पोस्ट के लिए अकाउंट चाहिए, ताकि पता रहे किसने क्या लिखा। दिन प्लान करना बिना अकाउंट के भी चलता है।',
        )}
      </p>
      {!staff && google && <GoogleButton clientId={google} onUser={done} />}
      {!staff && demo && (
        <button className="btn primary big google" onClick={demoSignIn} disabled={busy}>
          <Icon name="user" size={18} />
          {tr('Continue without Google (test)', 'Google के बिना जारी रखें (टेस्ट)')}
        </button>
      )}
      {!staff && !google && !demo && <small className="muted">{tr('Sign-in is not available right now.', 'अभी साइन इन उपलब्ध नहीं है।')}</small>}
      {apiOn() && staff && (
        <form className="staff-form" onSubmit={staffSignIn}>
          <input value={user} onChange={(e) => setUser(e.target.value)} placeholder={tr('Team username', 'टीम यूज़रनेम')} autoComplete="username" required />
          <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder={tr('Password', 'पासवर्ड')} autoComplete="current-password" required />
          <button className="btn primary" disabled={busy}>{tr('Team sign-in', 'टीम साइन इन')}</button>
        </form>
      )}
      {err && <small className="err">{err}</small>}
    </div>
  );
}

const AS: { v: Role; icon: string; en: string; hi: string; sub: [string, string] }[] = [
  { v: 'raahi', icon: 'user', en: 'Traveller (raahi)', hi: 'यात्री (राही)', sub: ['Plan days, collect stamps, ask Yatra', 'दिन प्लान करें, स्टैम्प लें, यात्रा से पूछें'] },
  { v: 'saarthi', icon: 'verify', en: 'Saarthi', hi: 'सारथी', sub: ['Local guides and custodians who check facts', 'तथ्य जाँचने वाले स्थानीय गाइड और संरक्षक'] },
  { v: 'business', icon: 'store', en: 'Business', hi: 'व्यवसाय', sub: ['List your shop, stall, stay or tours', 'अपनी दुकान, ठेला, ठहरना या टूर जोड़ें'] },
  { v: 'moderator', icon: 'shield', en: 'Dishaara team', hi: 'दिशारा टीम', sub: ['Moderators only', 'सिर्फ़ मॉडरेटर'] },
];

/** After sign-in: open the app for the account type picked. Partners without the role get their application. */
export function useEnterAs() {
  const { set } = useStore();
  const { go, open, closeAll } = useNav();
  return useCallback(
    (as: Role, u: Me | null) => {
      const roles = u?.roles ?? ['raahi'];
      closeAll();
      if (as === 'raahi' || !roles.includes(as)) {
        set({ role: 'raahi' });
        go('chat');
        if (as === 'saarthi') open({ kind: 'apply' });
        if (as === 'business') open({ kind: 'apply-biz' });
        return;
      }
      set({ role: as });
      go(as === 'saarthi' ? 's-home' : as === 'business' ? 'b-home' : 'm-home');
    },
    [set, go, open, closeAll],
  );
}

export function SignInPage({ as: preset }: { as?: Role }) {
  const { s, set } = useStore();
  const tr = useTr();
  const enter = useEnterAs();
  const [as, setAs] = useState<Role | null>(preset ?? null);
  const [err, setErr] = useState('');
  // Already signed in and asked for an account type: go straight there.
  useEffect(() => {
    if (s.signedIn && as) enter(as, s.user);
  }, [s.signedIn, as, s.user, enter]);
  const signedIn = (u: Me | null) => {
    if (!u || !as) return;
    if (as === 'moderator' && !u.roles.includes('moderator')) {
      api.signOut();
      set({ signedIn: false, user: null, role: 'raahi' });
      return setErr(tr('This account is not on the Dishaara team.', 'यह अकाउंट दिशारा टीम में नहीं है।'));
    }
    enter(as, u);
  };
  if (!as) {
    return (
      <LayerPage title={tr('Sign in', 'साइन इन')}>
        <p className="muted">{tr('Who are you signing in as?', 'आप किस रूप में साइन इन कर रहे हैं?')}</p>
        <div className="as-list">
          {AS.map((a) => (
            <button key={a.v} className="card row as-pick" onClick={() => setAs(a.v)}>
              <Icon name={a.icon} size={24} />
              <span className="grow"><b>{tr(a.en, a.hi)}</b><small>{tr(...a.sub)}</small></span>
              <Icon name="arrow" size={16} />
            </button>
          ))}
        </div>
      </LayerPage>
    );
  }
  const pick = AS.find((a) => a.v === as)!;
  return (
    <LayerPage title={tr(`Sign in: ${pick.en}`, `साइन इन: ${pick.hi}`)}>
      {!preset && <button className="link" onClick={() => setAs(null)}>{tr('Change account type', 'अकाउंट का प्रकार बदलें')}</button>}
      <SignInCard team={as === 'moderator'} onUser={signedIn} />
      {as === 'saarthi' && <p className="small muted">{tr('Not a saarthi yet? Sign in and you can apply. A moderator checks every application.', 'अभी सारथी नहीं? साइन इन करके आवेदन करें। हर आवेदन मॉडरेटर जाँचते हैं।')}</p>}
      {as === 'business' && <p className="small muted">{tr('No shop listed yet? Sign in and register it. A moderator approves it before it shows in the Bazaar.', 'अभी दुकान सूची में नहीं? साइन इन करके जोड़ें। बाज़ार में दिखने से पहले मॉडरेटर मंज़ूर करते हैं।')}</p>}
      {err && <small className="err">{err}</small>}
    </LayerPage>
  );
}

/** Wraps a page that only signed-in people can see. */
export function MembersOnly({ children, title }: { children: React.ReactNode; title: string }) {
  const { s } = useStore();
  if (s.signedIn) return <>{children}</>;
  return (
    <LayerPage title={title}>
      <SignInCard />
    </LayerPage>
  );
}
