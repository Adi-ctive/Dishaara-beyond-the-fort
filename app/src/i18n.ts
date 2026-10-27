import type { Lang } from './theme/ThemeProvider';

const S = {
  tagline: { en: 'Know before you go.', hi: 'जाने से पहले जानिए।' },
  sub: {
    en: 'Checked, dated facts from local saarthis. A day plan that fits your time.',
    hi: 'स्थानीय सारथियों से जाँची, तारीख वाली जानकारी। आपके समय में फिट होने वाला दिन।',
  },
  planDay: { en: 'Plan my day', hi: 'मेरा दिन प्लान करें' },
  signIn: { en: 'Sign in', hi: 'साइन इन' },
  guestNote: { en: 'No account needed to look around.', hi: 'देखने के लिए अकाउंट ज़रूरी नहीं।' },
  hello: { en: 'Namaste', hi: 'नमस्ते' },
  where: { en: 'Where to today?', hi: 'आज कहाँ चलें?' },
  tabChat: { en: 'Chat', hi: 'चैट' },
  tabRoadmap: { en: 'Roadmap', hi: 'रोडमैप' },
  tabMap: { en: 'Map', hi: 'नक्शा' },
  tabBazaar: { en: 'Bazaar', hi: 'बाज़ार' },
  tabProfile: { en: 'Profile', hi: 'प्रोफ़ाइल' },
  appearance: { en: 'Appearance', hi: 'रूप' },
  dark: { en: 'Dark', hi: 'डार्क' },
  light: { en: 'Light', hi: 'लाइट' },
  darkOnly: { en: 'This theme is dark only', hi: 'यह थीम सिर्फ़ डार्क है' },
  close: { en: 'Close', hi: 'बंद करें' },
  sos: { en: 'Emergency', hi: 'आपातकाल' },
  call112: { en: 'Call 112', hi: '112 पर कॉल करें' },
  call112Sub: { en: 'Police, fire, ambulance', hi: 'पुलिस, फ़ायर, एम्बुलेंस' },
  shareLoc: { en: 'Share my live location', hi: 'मेरी लाइव लोकेशन भेजें' },
  shareLocSub: { en: 'With the contact you chose', hi: 'आपके चुने हुए संपर्क को' },
  alertTeam: { en: 'Alert the Dishaara team', hi: 'दिशारा टीम को बताएं' },
  alertTeamSub: { en: 'A moderator sees it right away', hi: 'मॉडरेटर तुरंत देखेंगे' },
  soon: { en: 'Being built', hi: 'बन रहा है' },
  quick: { en: 'Plan my day in a few taps', hi: 'कुछ टैप में दिन प्लान करें' },
  quickSub: { en: 'Time, start point, interests. Your roadmap appears at once.', hi: 'समय, शुरुआत, रुचि। रोडमैप तुरंत।' },
  askAnything: { en: 'Ask Yatra anything, or hold the mic', hi: 'यात्रा से कुछ भी पूछें, या माइक दबाएँ' },
  level: { en: 'Level', hi: 'लेवल' },
  passport: { en: 'Passport', hi: 'पासपोर्ट' },
} as const;

export type Key = keyof typeof S;

export function t(key: Key, lang: Lang): string {
  return S[key][lang];
}
