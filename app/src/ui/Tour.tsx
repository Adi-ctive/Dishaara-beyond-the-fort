// "Show me around": a click-through tour for each kind of sign-in, from Pramaan's tour (C:\projects\pramaan\src\ui.tsx).
// It dims the screen and lights up one part at a time with a short note, switching tabs on the way. It runs once per
// role on first entry; Profile (raahi) and Settings (every role) replay it as "App tutorial". On a phone the note sits
// full width above or below the lit part, so it never covers it.
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useNav, type Tab } from '../nav';
import { useStore, type Role } from '../store';
import { useTheme } from '../theme/ThemeProvider';

type Step = { tab?: Tab; sel?: string; en: string; hi: string };

const TOURS: Record<Role, Step[]> = {
  raahi: [
    { en: 'Dishaara keeps one checked, dated record per place and plans a day that fits your time. A quick look around.', hi: 'दिशारा हर जगह का एक जाँचा, तारीख़ वाला रिकॉर्ड रखता है और आपके समय में फ़िट दिन बनाता है। एक छोटी सैर।' },
    { tab: 'chat', sel: '.composer', en: 'Ask Yatra anything: hours, tickets, how to get there, what is open. Every answer is checked against our records, with how sure each fact is.', hi: 'यात्रा से कुछ भी पूछें: समय, टिकट, कैसे पहुँचें, क्या खुला है। हर जवाब हमारे रिकॉर्ड से जाँचा जाता है, हर तथ्य कितना पक्का है उसके साथ।' },
    { tab: 'chat', sel: '.chat-bar', en: 'Your chats are kept. Reopen an old one and carry on, or start a new chat.', hi: 'आपकी चैट सहेजी रहती हैं। पुरानी खोलकर आगे पूछें, या नई चैट शुरू करें।' },
    { tab: 'roadmap', sel: '[data-tour="tab-roadmap"]', en: 'Your roadmap: each stop with its time, ride and ticket, and how every rupee and minute is worked out. Remove a stop with ×.', hi: 'आपका रोडमैप: हर पड़ाव का समय, सवारी और टिकट, और हर रुपये व मिनट का हिसाब। × से पड़ाव हटाएँ।' },
    { tab: 'map', sel: '.map-search', en: 'Find any place or shop on the map. Tap a pin for its card.', hi: 'नक्शे पर कोई भी जगह या दुकान खोजें। पिन पर टैप करें।' },
    { tab: 'bazaar', sel: '[data-tour="tab-bazaar"]', en: 'The Bazaar: shops and stalls near your route, with what their owners tell us.', hi: 'बाज़ार: आपके रास्ते के पास की दुकानें, मालिकों की दी जानकारी के साथ।' },
    { sel: '[data-tour="sos"]', en: 'Emergency: one tap for 112 and nearby help. It is always up here.', hi: 'आपात स्थिति: 112 और पास की मदद, एक टैप में। यह हमेशा ऊपर रहता है।' },
    { sel: '[data-tour="city"]', en: 'Switch between Gwalior and Indore here.', hi: 'यहाँ ग्वालियर और इंदौर के बीच बदलें।' },
    { tab: 'profile', sel: '[data-tour="tutorial"]', en: 'Your passport, stamps and settings. Open this tour again any time from App tutorial.', hi: 'आपका पासपोर्ट, स्टैम्प और सेटिंग्स। यह सैर कभी भी ऐप ट्यूटोरियल से दोबारा देखें।' },
  ],
  saarthi: [
    { tab: 's-home', en: 'You are a saarthi: you check places on site so raahis get facts they can trust. A quick look around.', hi: 'आप सारथी हैं: आप जगहों को मौके पर जाँचते हैं ताकि राहियों को भरोसेमंद जानकारी मिले। एक छोटी सैर।' },
    { tab: 's-form', sel: '[data-tour="tab-s-form"]', en: 'Add data: pick a place (or the whole city), the field, what you saw and how you know. Add a photo of the board or ticket as proof.', hi: 'डेटा जोड़ें: जगह (या पूरा शहर), हिस्सा, आपने क्या देखा और कैसे पता है। सबूत के लिए बोर्ड या टिकट की फ़ोटो जोड़ें।' },
    { tab: 's-form', en: 'Nothing goes live on your word alone. In your first week a moderator approves each entry, after that another saarthi does.', hi: 'सिर्फ़ आपके कहने से कुछ लाइव नहीं होता। पहले हफ़्ते हर एंट्री मॉडरेटर मंज़ूर करते हैं, उसके बाद कोई दूसरा सारथी।' },
    { tab: 's-verify', sel: '[data-tour="tab-s-verify"]', en: "Verify other saarthis' entries against their proof. You can never verify your own.", hi: 'दूसरे सारथियों की एंट्री उनके सबूत से जाँचें। अपनी एंट्री आप कभी नहीं जाँच सकते।' },
    { tab: 's-tickets', sel: '[data-tour="tab-s-tickets"]', en: 'Questions and corrections from raahis about places near you. Answer from what you saw.', hi: 'आपके पास की जगहों के बारे में राहियों के सवाल और सुधार। जो देखा उससे जवाब दें।' },
    { tab: 's-posts', sel: '[data-tour="tab-s-posts"]', en: 'Share checks, photos and short videos with raahis.', hi: 'राहियों के साथ जाँच, फ़ोटो और छोटे वीडियो साझा करें।' },
    { sel: '[data-tour="settings"]', en: 'Settings: language, switching role, and this tour again (App tutorial).', hi: 'सेटिंग्स: भाषा, भूमिका बदलना, और यह सैर दोबारा (ऐप ट्यूटोरियल)।' },
  ],
  business: [
    { tab: 'b-home', en: 'Your shop on Dishaara: raahis see it in the Bazaar and on the map near their route. A quick look around.', hi: 'दिशारा पर आपकी दुकान: राही इसे बाज़ार में और रास्ते के पास नक्शे पर देखते हैं। एक छोटी सैर।' },
    { tab: 'b-edit', sel: '[data-tour="tab-b-edit"]', en: 'My page: hours, what you sell, offers and photos. Raahis see it as owner-provided.', hi: 'मेरा पेज: समय, क्या बेचते हैं, ऑफ़र और फ़ोटो। राहियों को यह मालिक की दी जानकारी दिखती है।' },
    { tab: 'b-comments', sel: '[data-tour="tab-b-comments"]', en: 'Comments from raahis on your page. Reply here.', hi: 'आपके पेज पर राहियों की टिप्पणियाँ। यहाँ जवाब दें।' },
    { tab: 'b-feed', sel: '[data-tour="tab-b-feed"]', en: 'The community feed: posts from saarthis and other shops nearby.', hi: 'समुदाय: सारथियों और पास की दुकानों की पोस्ट।' },
    { sel: '[data-tour="settings"]', en: 'Settings: language, switching role, and this tour again (App tutorial).', hi: 'सेटिंग्स: भाषा, भूमिका बदलना, और यह सैर दोबारा (ऐप ट्यूटोरियल)।' },
  ],
  moderator: [
    { tab: 'm-home', en: 'You keep Dishaara honest: you approve what goes live and run the day. A quick look around.', hi: 'आप दिशारा को सच्चा रखते हैं: क्या लाइव होगा यह मंज़ूर करते हैं और दिन चलाते हैं। एक छोटी सैर।' },
    { tab: 'm-home', sel: '[data-tour="tab-m-home"]', en: 'Overview: what is waiting, emergency presses and stale facts, in one place.', hi: 'सार: क्या बाकी है, आपात बटन और पुराने तथ्य, एक जगह।' },
    { tab: 'm-queue', sel: '[data-tour="tab-m-queue"]', en: 'Queues: saarthi entries, applications, businesses and flags. Check the proof, then approve or reject. You cannot approve your own entry.', hi: 'कतार: सारथी एंट्री, आवेदन, दुकानें और फ़्लैग। सबूत देखें, फिर मंज़ूर या नामंज़ूर करें। अपनी एंट्री आप मंज़ूर नहीं कर सकते।' },
    { tab: 'm-twist', sel: '[data-tour="tab-m-twist"]', en: 'Twist: mark a place closed or crowded, or change the day (rain, half budget, festival). Every raahi plan replans at once.', hi: 'ट्विस्ट: जगह बंद या भीड़ वाली बताएँ, या दिन बदलें (बारिश, आधा बजट, त्योहार)। हर राही का प्लान तुरंत बदलता है।' },
    { tab: 'm-alerts', sel: '[data-tour="tab-m-alerts"]', en: 'SOS: every emergency press with the time, the account and how to reach them. Mark each one handled.', hi: 'SOS: हर आपात बटन, समय, खाता और संपर्क के साथ। हर एक को निपटा हुआ चिह्नित करें।' },
    { tab: 'm-news', sel: '[data-tour="tab-m-news"]', en: 'News: local headlines arrive here every day. Raahis see only what you approve.', hi: 'ख़बरें: स्थानीय ख़बरें रोज़ यहाँ आती हैं। राहियों को सिर्फ़ वही दिखती हैं जो आप मंज़ूर करें।' },
    { sel: '[data-tour="settings"]', en: 'Settings: language, switching role, and this tour again (App tutorial).', hi: 'सेटिंग्स: भाषा, भूमिका बदलना, और यह सैर दोबारा (ऐप ट्यूटोरियल)।' },
  ],
};

const KEY = (r: Role) => `dishaara.tour.${r}`;
const seen = (r: Role) => {
  try {
    return localStorage.getItem(KEY(r)) === '1';
  } catch {
    return true;
  }
};

/** Starts the tour for the role on screen, from anywhere (Profile, Settings). */
export const showMeAround = () => window.dispatchEvent(new Event('dishaara:tour'));

export function Tour({ ready }: { ready: boolean }) {
  const { s } = useStore();
  const { go, layers, closeAll } = useNav();
  const { lang } = useTheme();
  const hi = lang === 'hi';
  const steps = TOURS[s.role];
  const [i, setI] = useState<number | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [vw, setVw] = useState(() => window.innerWidth);

  // First entry for each role: once nothing else is open (the raahi's interests screen comes first).
  // Outside test accounts (security scanners) never get it on their own: it would sit over every screen they test.
  const tester = s.user?.kind === 'test';
  useEffect(() => {
    if (!ready || tester || layers.length || i !== null || seen(s.role)) return;
    const t = setTimeout(() => setI(0), 900);
    return () => clearTimeout(t);
  }, [ready, tester, layers.length, s.role, i]);
  useEffect(() => {
    const replay = () => {
      closeAll();
      setI(0);
    };
    addEventListener('dishaara:tour', replay);
    return () => removeEventListener('dishaara:tour', replay);
  }, [closeAll]);
  // A role switch mid-tour starts that role's tour from the top, if it has not been seen.
  useEffect(() => setI(null), [s.role]);

  const done = useCallback(() => {
    try {
      localStorage.setItem(KEY(s.role), '1');
    } catch {
      /* storage blocked: the tour may show again next time */
    }
    setI(null);
    setBox(null);
  }, [s.role]);

  const step = i === null ? null : steps[i];
  useEffect(() => {
    if (step?.tab) go(step.tab);
  }, [step, go]);
  useLayoutEffect(() => {
    if (!step) return;
    let el: HTMLElement | null = null;
    const upd = () => {
      setVw(window.innerWidth);
      el = step.sel ? document.querySelector<HTMLElement>(step.sel) : null;
      setBox(el && el.offsetParent !== null ? el.getBoundingClientRect() : null);
    };
    setBox(null);
    // Wait for the tab to change, then bring the part into view. A new screen may still be fading in, so look again.
    const show = (behavior: ScrollBehavior) => () => {
      upd();
      const r = el?.getBoundingClientRect();
      if (el && r && (r.top < 60 || r.bottom > window.innerHeight - 80)) el.scrollIntoView({ block: 'center', behavior });
    };
    const t1 = setTimeout(show('smooth'), 380);
    const t2 = setTimeout(show('auto'), 900); // a smooth scroll can be cut short while the screen is still fading in
    const t3 = setTimeout(upd, 1400);
    addEventListener('resize', upd);
    addEventListener('scroll', upd, true);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      removeEventListener('resize', upd);
      removeEventListener('scroll', upd, true);
    };
  }, [step]);
  useEffect(() => {
    if (i === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done();
      if (e.key === 'ArrowRight') setI((x) => (x === null ? x : Math.min(steps.length - 1, x + 1)));
      if (e.key === 'ArrowLeft') setI((x) => (x === null ? x : Math.max(0, x - 1)));
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [i, steps.length, done]);

  if (i === null || !step) return null;
  const pad = 6;
  const narrow = vw < 600;
  // The note goes on the side of the screen away from the lit part.
  const lower = box ? box.top + box.height / 2 > window.innerHeight / 2 : false;
  const tipStyle: React.CSSProperties = narrow
    ? lower || !box ? { top: 'calc(16px + env(safe-area-inset-top))', left: 16, right: 16 } : { bottom: 'calc(16px + env(safe-area-inset-bottom))', left: 16, right: 16 }
    : box
      ? { width: 340, left: Math.min(Math.max(16, box.left), vw - 356), ...(lower ? { bottom: window.innerHeight - box.top + pad + 12 } : { top: box.bottom + pad + 12 }) }
      : { width: 360, left: vw / 2 - 180, top: window.innerHeight / 2 - 90 };
  if (!box && !narrow && step.sel === undefined) tipStyle.top = window.innerHeight / 2 - 90;
  const last = i === steps.length - 1;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={hi ? 'ऐप की सैर' : 'App tour'}>
      {box ? (
        <motion.div className="tour-spot" initial={false} animate={{ left: box.left - pad, top: box.top - pad, width: box.width + 2 * pad, height: box.height + 2 * pad }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <AnimatePresence mode="wait">
        <motion.div key={i} className="tour-tip" style={tipStyle} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <small className="tour-count">{hi ? `${steps.length} में से ${i + 1}` : `Step ${i + 1} of ${steps.length}`}</small>
          <p>{step[lang]}</p>
          <div className="tour-row">
            <button type="button" className="tour-skip" onClick={done}>{hi ? 'सैर छोड़ें' : 'Skip tour'}</button>
            <span className="grow" />
            {i > 0 && <button type="button" className="btn ghost small" onClick={() => setI(i - 1)}>{hi ? 'पीछे' : 'Back'}</button>}
            <button type="button" className="btn small" onClick={() => (last ? done() : setI(i + 1))}>{last ? (hi ? 'समझ गया' : 'Got it') : hi ? 'आगे' : 'Next'}</button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
