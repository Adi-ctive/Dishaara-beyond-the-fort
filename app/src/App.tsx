import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Particles } from './art/Particles';
import { OrnamentTop } from './art/Ornaments';
import { t } from './i18n';
import { useNav, type Layer, type Tab } from './nav';
import { Landing } from './screens/Landing';
import { Alerts, BazaarTab } from './screens/raahi/Bazaar';
import { ChatTab } from './screens/raahi/Chat';
import { MapTab } from './screens/raahi/MapTab';
import { Onboarding } from './screens/raahi/Onboarding';
import { PlaceView } from './screens/raahi/PlaceView';
import { Apply, Feedback, History, Look, ProfileTab, PromptEditor, Quests, Rewards, Settings } from './screens/raahi/Profile';
import { Leaderboard } from './screens/raahi/Leaderboard';
import { LevelUp } from './ui/LevelUp';
import { BizView, Community, FeedPage, SaarthiPage } from './screens/Social';
import { MembersOnly, SignInPage } from './ui/SignIn';
import { PlaceStory } from './screens/raahi/PlaceStory';
import { QuickPlan } from './screens/raahi/QuickPlan';
import { RoadmapTab } from './screens/raahi/Roadmap';
import { Passport, StampMoment } from './screens/raahi/Stamps';
import { SaarthiForm, SaarthiHome, SaarthiPosts, SaarthiTickets, SaarthiVerify } from './screens/Saarthi';
import { ApplyBusiness, BusinessComments, BusinessEdit, BusinessHome } from './screens/Business';
import { ModAlerts, ModHome, ModNews, ModQueue, ModTwist } from './screens/Moderator';
import { Diagram, Duel } from './screens/Event';
import { useStore, type Role } from './store';
import { useTheme } from './theme/ThemeProvider';
import { Boundary } from './ui/Boundary';
import { Emergency, useTripLive } from './ui/Emergency';
import { CityPick } from './ui/CityPick';
import { Icon } from './ui/Icon';
import { ThemeSheet } from './ui/ThemeSheet';

type TabDef = { id: Tab; icon: string; en: string; hi: string };
const TABS: Record<Role, TabDef[]> = {
  raahi: [
    { id: 'chat', icon: 'chat', en: t('tabChat', 'en'), hi: t('tabChat', 'hi') },
    { id: 'roadmap', icon: 'route', en: t('tabRoadmap', 'en'), hi: t('tabRoadmap', 'hi') },
    { id: 'map', icon: 'map', en: t('tabMap', 'en'), hi: t('tabMap', 'hi') },
    { id: 'bazaar', icon: 'store', en: t('tabBazaar', 'en'), hi: t('tabBazaar', 'hi') },
    { id: 'profile', icon: 'user', en: t('tabProfile', 'en'), hi: t('tabProfile', 'hi') },
  ],
  saarthi: [
    { id: 's-home', icon: 'user', en: 'Home', hi: 'होम' },
    { id: 's-form', icon: 'form', en: 'Add data', hi: 'डेटा' },
    { id: 's-verify', icon: 'verify', en: 'Verify', hi: 'जाँचें' },
    { id: 's-tickets', icon: 'inbox', en: 'Tickets', hi: 'टिकट' },
    { id: 's-posts', icon: 'sparkle', en: 'Posts', hi: 'पोस्ट' },
  ],
  business: [
    { id: 'b-home', icon: 'store', en: 'Home', hi: 'होम' },
    { id: 'b-edit', icon: 'edit', en: 'My page', hi: 'पेज' },
    { id: 'b-comments', icon: 'chat', en: 'Comments', hi: 'टिप्पणी' },
    { id: 'b-feed', icon: 'users', en: 'Community', hi: 'समुदाय' },
  ],
  moderator: [
    { id: 'm-home', icon: 'users', en: 'Overview', hi: 'सार' },
    { id: 'm-queue', icon: 'inbox', en: 'Queues', hi: 'कतार' },
    { id: 'm-twist', icon: 'dice', en: 'Twist', hi: 'ट्विस्ट' },
    { id: 'm-alerts', icon: 'shield', en: 'SOS', hi: 'SOS' },
    { id: 'm-news', icon: 'news', en: 'News', hi: 'ख़बरें' },
  ],
};

function Screen({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'chat': return <ChatTab />;
    case 'roadmap': return <RoadmapTab />;
    case 'map': return <MapTab />;
    case 'bazaar': return <BazaarTab />;
    case 'profile': return <ProfileTab />;
    case 's-home': return <SaarthiHome />;
    case 's-form': return <SaarthiForm />;
    case 's-verify': return <SaarthiVerify />;
    case 's-tickets': return <SaarthiTickets />;
    case 's-posts': return <SaarthiPosts />;
    case 'b-home': return <BusinessHome />;
    case 'b-edit': return <BusinessEdit />;
    case 'b-comments': return <BusinessComments />;
    case 'b-feed': return <div className="screen"><Community /></div>;
    case 'm-home': return <ModHome />;
    case 'm-queue': return <ModQueue />;
    case 'm-twist': return <ModTwist />;
    case 'm-alerts': return <ModAlerts />;
    case 'm-news': return <ModNews />;
  }
}

function LayerView({ l }: { l: Layer }) {
  switch (l.kind) {
    case 'place': return <PlaceView id={l.id} />;
    case 'stamp': return <MembersOnly title="Stamp"><StampMoment id={l.id} /></MembersOnly>;
    case 'quick': return <QuickPlan hours={l.hours} />;
    case 'onboarding': return <Onboarding />;
    case 'passport': return <MembersOnly title="Passport"><Passport /></MembersOnly>;
    case 'quests': return <MembersOnly title="Quests"><Quests /></MembersOnly>;
    case 'rewards': return <MembersOnly title="Rewards"><Rewards /></MembersOnly>;
    case 'leaders': return <Leaderboard />;
    case 'alerts': return <Alerts />;
    case 'saarthi': return <SaarthiPage id={l.id} />;
    case 'biz': return <BizView id={l.id} />;
    case 'feed': return <FeedPage />;
    case 'prompt': return <PromptEditor />;
    case 'history': return <MembersOnly title="History"><History /></MembersOnly>;
    case 'settings': return <Settings />;
    case 'feedback': return <MembersOnly title="Feedback"><Feedback id={l.id} /></MembersOnly>;
    case 'apply': return <MembersOnly title="Become a saarthi"><Apply /></MembersOnly>;
    case 'apply-biz': return <MembersOnly title="List your shop"><ApplyBusiness /></MembersOnly>;
    case 'duel': return <Duel />;
    case 'diagram': return <Diagram />;
    case 'look': return <MembersOnly title="Your look"><Look /></MembersOnly>;
    case 'signin': return <SignInPage as={l.as} />;
    case 'story': return <PlaceStory id={l.id} />;
  }
}

export function App() {
  const { theme, lang, setLang } = useTheme();
  const { s, set } = useStore();
  const { tab, go, layers, open } = useNav();
  const [entered, setEntered] = useState(() => location.hash.length > 1);
  const [themeOpen, setThemeOpen] = useState(false);
  const tabs = TABS[s.role];
  const tripLive = useTripLive();
  const shown = tabs.some((x) => x.id === tab) ? tab : tabs[0].id;

  return (
    <div className={`app${s.role === 'raahi' && tripLive ? ' trip-live' : ''}`}>
      <Particles kind={theme.particles} />
      <header className="topbar">
        <OrnamentTop kind={theme.ornament} />
        <div className="topbar-row">
          <button className="logo" onClick={() => setEntered(false)} aria-label="Dishaara home">
            <span className="logo-mark" aria-hidden="true">
              <Icon name="pin" size={18} />
            </span>
            Dishaara
            {s.role !== 'raahi' && <span className="role-tag">{s.role}</span>}
          </button>
          <div className="topbar-actions">
            {entered && s.role === 'raahi' && <CityPick />}
            {entered && s.role === 'raahi' && !tripLive && <Emergency variant="top" />}
            {entered && s.role !== 'raahi' && (
              <button className="icon-btn" onClick={() => open({ kind: 'settings' })} aria-label={lang === 'hi' ? 'सेटिंग्स' : 'Settings'} title={lang === 'hi' ? 'सेटिंग्स' : 'Settings'}>
                <Icon name="settings" size={19} />
              </button>
            )}
            <button className="icon-btn" onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} aria-label="Language">
              <span className="lang">{lang === 'en' ? 'हि' : 'En'}</span>
            </button>
            <button className="icon-btn" data-theme-button onClick={() => setThemeOpen(true)} aria-label={t('appearance', lang)}>
              <Icon name="palette" size={20} />
            </button>
          </div>
        </div>
      </header>

      {!entered ? (
        <Landing
          onEnter={() => {
            setEntered(true);
            go(shown);
            if (!s.onboarded && s.role === 'raahi') open({ kind: 'onboarding' });
          }}
          onSignIn={() => {
            setEntered(true);
            go(shown);
            open({ kind: 'signin' });
          }}
        />
      ) : (
        <>
          <AnimatePresence mode="wait">
            <motion.main key={shown} className="content" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
              <Boundary>
                <Screen tab={shown} />
              </Boundary>
            </motion.main>
          </AnimatePresence>
          {s.role === 'raahi' && tripLive && <Emergency />}
          <nav className="tabbar" aria-label="Main" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
            {tabs.map((x) => (
              <button key={x.id} className={`tab${shown === x.id ? ' on' : ''}`} onClick={() => go(x.id)} aria-current={shown === x.id ? 'page' : undefined}>
                {shown === x.id && <motion.span layoutId="tab-dot" className="tab-glow" transition={{ type: 'spring', damping: 26, stiffness: 340 }} />}
                <Icon name={x.icon} size={22} />
                <span>{x[lang]}</span>
              </button>
            ))}
          </nav>
        </>
      )}
      <AnimatePresence>
        {layers.map((l, i) => (
          <Boundary key={`${l.kind}-${i}`}>
            <LayerView l={l} />
          </Boundary>
        ))}
      </AnimatePresence>
      <ThemeSheet open={themeOpen} onClose={() => setThemeOpen(false)} />
      {s.role === 'raahi' && s.signedIn && <LevelUp />}
    </div>
  );
}
