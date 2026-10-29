import { MotionConfig, MotionGlobalConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { reloadForNewVersion } from './ui/Boundary';
import { NavProvider, type Layer, type Tab } from './nav';
import { StoreProvider } from './store';
import { ThemeProvider } from './theme/ThemeProvider';
import './styles.css';
import './screens.css';
import './story.css';
import './desktop.css';

// A deploy while this tab was open removed a file the page asks for: load the new version instead of failing.
addEventListener('vite:preloadError', (e) => {
  if (reloadForNewVersion()) e.preventDefault();
});

const initial = (location.hash.slice(1) || 'chat') as Tab;
// ?instant skips all animations (used for automated testing in a background tab).
// Automated browsers (security scanners, test robots) get no animations, so every screen is complete the moment it shows.
if (new URLSearchParams(location.search).has('instant') || navigator.webdriver) MotionGlobalConfig.skipAnimations = true;
// Deep link to a full-screen page, for demos and shared links: ?open=place.sas-bahu, ?open=passport
const openParam = new URLSearchParams(location.search).get('open');
const initialLayers: Layer[] = openParam ? [(([kind, id]) => (id ? { kind, id } : { kind }) as Layer)(openParam.split('.'))] : [];
// /login, /signin and the like open the sign-in page (scanners and people try these addresses first).
if (!openParam && /^\/(login|log-in|signin|sign-in|signup|sign-up|auth|account)\/?$/i.test(location.pathname)) initialLayers.push({ kind: 'signin' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Movement is skipped for people who ask their phone for less motion. */}
    <MotionConfig reducedMotion="user">
    <ThemeProvider>
      <StoreProvider>
        <NavProvider initial={initial} initialLayers={initialLayers}>
          <App />
        </NavProvider>
      </StoreProvider>
    </ThemeProvider>
    </MotionConfig>
  </StrictMode>,
);

// Offline support in production builds only, so the dev server never serves a stale copy.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // The browser may serve this page's own files from memory without asking the worker,
  // so tell the worker what was loaded and it caches those too (also the map once opened).
  const share = () =>
    navigator.serviceWorker.ready.then((r) =>
      r.active?.postMessage({ cache: performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith(location.origin)) }),
    );
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(share).catch(() => {});
    setInterval(share, 30000);
  });
}
