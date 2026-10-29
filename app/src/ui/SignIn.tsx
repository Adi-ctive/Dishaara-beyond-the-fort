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

export function SignInCard({ compact = false, team = false, email = false, onUser }: { compact?: boolean; team?: boolean; email?: boolean; onUser?: (u: Me) => void }) {
  const { set } = useStore();
  const tr = useTr();
  const [google, setGoogle] = useState<string | null>(null);
  const [demo, setDemo] = useState(!apiOn());
  // Until the server says which sign-ins are on, say nothing about them: a robot or a cold start read the old
  // "not available" line before the answer came and gave up (ArgosX, 30 Oct).
  const [ready, setReady] = useState(!apiOn());
  const staff = team;
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.health().then((h) => {
      setReady(true);
      if (!h) return;
      setGoogle(h.google);
      setDemo(h.demoLogin);
    });
  }, []);

  const done = useCallback(
    (u: Me | null) => {
      setBusy(false);
      if (!u) return setErr(lastError || tr('Sign-in failed. Try again.', 'साइन इन नहीं हुआ। फिर कोशिश करें।'));
      // Leave the /login address once signed in, so a reload (or a scanner checking the page) lands in the app.
      if (/^\/(login|log-in|signin|sign-in|signup|sign-up|auth|account)\/?$/i.test(location.pathname)) history.replaceState(null, '', '/' + location.search + location.hash);
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
  const [byEmail, setByEmail] = useState(email);
  const staffSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    (byEmail ? api.signInEmail(user.trim(), pw) : api.signInStaff(user.trim(), pw)).then((u) => {
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
      {!staff && !ready && <small className="muted">{tr('Loading sign-in options…', 'साइन इन के विकल्प आ रहे हैं…')}</small>}
      {!staff && ready && !google && !demo && <small className="muted">{tr('Google sign-in is not available right now. Test accounts can use email below.', 'अभी Google साइन इन उपलब्ध नहीं है। टेस्ट अकाउंट नीचे ईमेल से साइन इन करें।')}</small>}
      {apiOn() && (staff || byEmail) && (
        <form className="staff-form" onSubmit={staffSignIn}>
          <label className="sr-only" htmlFor="signin-user">{staff ? tr('Team username', 'टीम यूज़रनेम') : tr('Email', 'ईमेल')}</label>
          <input id="signin-user" value={user} onChange={(e) => setUser(e.target.value)} placeholder={staff ? tr('Team username', 'टीम यूज़रनेम') : tr('Email', 'ईमेल')} type={staff ? 'text' : 'email'} autoComplete={staff ? 'username' : 'email'} required />
          <label className="sr-only" htmlFor="signin-pw">{tr('Password', 'पासवर्ड')}</label>
          <input id="signin-pw" value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder={tr('Password', 'पासवर्ड')} autoComplete="current-password" required />
          <button className="btn primary" disabled={busy}>{staff ? tr('Team sign-in', 'टीम साइन इन') : tr('Sign in with email', 'ईमेल से साइन इन')}</button>
        </form>
      )}
      {apiOn() && !staff && !byEmail && (
        <button type="button" className="link small" onClick={() => setByEmail(true)}>
          {tr('Test account? Sign in with email', 'टेस्ट अकाउंट? ईमेल से साइन इन करें')}
        </button>
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

/** email: open with the email form showing (the /login address: testers and scanners get in with one form). */
export function SignInPage({ as: preset, email = false }: { as?: Role; email?: boolean }) {
  const { s, set } = useStore();
  const tr = useTr();
  const enter = useEnterAs();
  const [as, setAs] = useState<Role | null>(preset ?? null);
  const [err, setErr] = useState('');
  // Already signed in and asked for an account type: go straight there.
  useEffect(() => {
    if (s.signedIn && as && !email) enter(as, s.user);  // from /login the sign-in itself picks the account's own role
  }, [s.signedIn, as, s.user, enter, email]);
  const signedIn = (u: Me | null) => {
    if (!u || !as) return;
    if (as === 'moderator' && !u.roles.includes('moderator')) {
      api.signOut();
      set({ signedIn: false, user: null, role: 'raahi' });
      return setErr(tr('This account is not on the Dishaara team.', 'यह अकाउंट दिशारा टीम में नहीं है।'));
    }
    // From /login, a test account opens in its own role (a saarthi or shop login lands on its own screens).
    enter(email ? (u.roles.includes('business') ? 'business' : u.roles.includes('saarthi') ? 'saarthi' : 'raahi') : as, u);
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
      <SignInCard team={as === 'moderator'} email={email} onUser={signedIn} />
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
