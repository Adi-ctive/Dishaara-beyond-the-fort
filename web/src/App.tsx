import Chat from './pages/Chat';
import Console from './pages/Console';
import Home from './pages/Home';
import More from './pages/More';
import Partner from './pages/Partner';
import Place from './pages/Place';
import Plan from './pages/Plan';
import Profile from './pages/Profile';
import { Setup, Welcome } from './pages/Welcome';
import { useA, useRoute } from './store';

const NAV = [
  ['/', 'navChat', 'M4 4h16v12H8l-4 4V4Zm4 5v2h8V9H8Z'],
  ['/explore', 'navExplore', 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z'],
  ['/plan', 'navPlan', 'M4 5h16v2H4V5Zm0 6h10v2H4v-2Zm0 6h16v2H4v-2Zm14-6.5 3 1.5-3 1.5v-3Z'],
  ['/you', 'navYou', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z'],
  ['/more', 'navMore', 'M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z'],
] as const;

export default function App() {
  const a = useA();
  const route = useRoute();
  if (!a.entered) return <Welcome />;
  if (!a.setupDone && !route.startsWith('/place')) return <Setup />;

  const page = route.startsWith('/place/') ? <Place id={route.slice(7)} />
    : route === '/explore' ? <Home /> : route === '/plan' ? <Plan /> : route === '/you' || route === '/profile' ? <Profile />
    : route === '/more' ? <More /> : route === '/console' ? <Console /> : route === '/partner' ? <Partner /> : <Chat />;
  const active = (p: string) =>
    p === '/' ? route === '/' : p === '/explore' ? route === p || route.startsWith('/place') : p === '/more' ? ['/more', '/console', '/partner'].includes(route) : route === p || (p === '/you' && route === '/profile');
  return (
    <>
      <header className="top">
        <a className="brand" href="#/">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden><path d="M16 2 4 9v2h24V9L16 2Z" fill="var(--terracotta)" /><path d="M7 13h3v11H7zm7.5 0h3v11h-3zM22 13h3v11h-3zM4 26h24v3H4z" fill="var(--teal)" /><circle cx="16" cy="7.5" r="1.6" fill="var(--sand)" /></svg>
          <span><b>Dishaara</b><small>दिशारा</small></span>
        </a>
        <nav className="desk-nav" aria-label="Main">
          {NAV.map(([p, k]) => <a key={p} href={`#${p}`} className={active(p) ? 'on' : ''} aria-current={active(p) ? 'page' : undefined}>{a.t(k)}</a>)}
        </nav>
        <div className="lang" role="group" aria-label="Language">
          <button className={a.lang === 'en' ? 'on' : ''} aria-pressed={a.lang === 'en'} onClick={() => a.setLang('en')}>EN</button>
          <button className={a.lang === 'hi' ? 'on' : ''} aria-pressed={a.lang === 'hi'} onClick={() => a.setLang('hi')} lang="hi">हि</button>
        </div>
      </header>
      <main className={route === '/' ? 'is-chat' : ''}>{page}</main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map(([p, k, d]) => (
          <a key={p} href={`#${p}`} className={active(p) ? 'on' : ''} aria-current={active(p) ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path fill="currentColor" d={d} /></svg>
            <span>{a.t(k)}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
