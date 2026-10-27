// Which tab is showing, and which full-screen layer (place page, stamp moment...) sits on top.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Tab = 'chat' | 'roadmap' | 'map' | 'bazaar' | 'profile' | 's-home' | 's-form' | 's-verify' | 's-tickets' | 's-posts' | 'b-home' | 'b-edit' | 'b-comments' | 'b-feed' | 'm-home' | 'm-queue' | 'm-twist' | 'm-alerts' | 'm-news';
export type Layer =
  | { kind: 'place'; id: string }
  | { kind: 'stamp'; id: string }
  | { kind: 'quick'; hours?: number }
  | { kind: 'onboarding' }
  | { kind: 'passport' }
  | { kind: 'quests' }
  | { kind: 'rewards' }
  | { kind: 'leaders' }
  | { kind: 'alerts' }
  | { kind: 'saarthi'; id: string }
  | { kind: 'prompt' }
  | { kind: 'history' }
  | { kind: 'settings' }
  | { kind: 'feedback'; id: string }
  | { kind: 'apply' }
  | { kind: 'apply-biz' }
  | { kind: 'duel' }
  | { kind: 'diagram' }
  | { kind: 'look' }
  | { kind: 'biz'; id: string }
  | { kind: 'feed' }
  | { kind: 'signin'; as?: import('./store').Role }
  | { kind: 'story'; id: string };

type Ctx = { tab: Tab; go: (t: Tab) => void; layers: Layer[]; open: (l: Layer) => void; replace: (l: Layer) => void; back: () => void; closeAll: () => void };
const NavCtx = createContext<Ctx | null>(null);

export function NavProvider({ initial, initialLayers = [], children }: { initial: Tab; initialLayers?: Layer[]; children: ReactNode }) {
  const [tab, setTab] = useState<Tab>(initial);
  const [layers, setLayers] = useState<Layer[]>(initialLayers);
  const go = useCallback((t: Tab) => {
    setTab(t);
    setLayers([]);
    history.replaceState(null, '', `#${t}`);
    scrollTo({ top: 0 });
  }, []);
  // The phone's back button and edited addresses switch tabs too.
  useEffect(() => {
    const onHash = () => {
      const t = location.hash.slice(1) as Tab;
      if (t) {
        setTab(t);
        setLayers([]);
      }
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const same = (a?: Layer, b?: Layer) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
  // Opening the page that is already on top does nothing (no second copy to go back through).
  const open = useCallback((l: Layer) => setLayers((x) => (same(x[x.length - 1], l) ? x : [...x, l])), []);
  // Swap the top page for another, or step back to it when it is the one underneath.
  const replace = useCallback((l: Layer) => setLayers((x) => (same(x[x.length - 2], l) ? x.slice(0, -1) : [...x.slice(0, -1), l])), []);
  const back = useCallback(() => setLayers((x) => x.slice(0, -1)), []);
  const closeAll = useCallback(() => setLayers([]), []);
  // The browser's and the phone's back button close the top page. While any page is open, one extra
  // history entry is kept; going back to it pops a page and puts the entry back if pages remain.
  const open_ = layers.length > 0;
  useEffect(() => {
    if (open_ && !history.state?.dl) history.pushState({ dl: 1 }, '', location.href);
    if (!open_ && history.state?.dl) history.replaceState(null, '', location.href);
  }, [open_, layers.length]);
  useEffect(() => {
    const onPop = () => setLayers((x) => x.slice(0, -1));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const value = useMemo(() => ({ tab, go, layers, open, replace, back, closeAll }), [tab, go, layers, open, replace, back, closeAll]);
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export function useNav(): Ctx {
  const c = useContext(NavCtx);
  if (!c) throw new Error('useNav outside NavProvider');
  return c;
}
