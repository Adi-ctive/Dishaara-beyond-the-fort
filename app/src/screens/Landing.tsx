import { motion } from 'motion/react';
import { LandmarkInk } from '../art/Landmarks';
import { t } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../ui/Icon';

const PLACES = [
  ['Gwalior Fort', 'ग्वालियर किला'],
  ['Teli ka Mandir', 'तेली का मंदिर'],
  ['Sas-Bahu', 'सास-बहू'],
  ['Jai Vilas', 'जय विलास'],
  ['Tansen tomb', 'तानसेन मकबरा'],
  ['Rajwada, Indore', 'राजवाड़ा, इंदौर'],
  ['Sarafa Bazaar', 'सराफ़ा बाज़ार'],
  ['Lal Bagh', 'लाल बाग'],
];

function Ribbon({ reverse }: { reverse?: boolean }) {
  const items = [...PLACES, ...PLACES];
  return (
    <div className={`ribbon${reverse ? ' reverse' : ''}`} aria-hidden="true">
      <div className="ribbon-track">
        {items.map(([en, hi], i) => (
          <span key={i}>
            {reverse ? hi : en}
            <i>✦</i>
          </span>
        ))}
      </div>
    </div>
  );
}

const rise = (d: number) => ({
  // Movement only, never hidden: a screenshot or an automated test taken mid-animation still sees every word and button
  // (30 Oct: the ArgosX Pro scan saw a blank landing page).
  initial: { y: 16 },
  animate: { y: 0 },
  transition: { delay: d, duration: 0.7, ease: [0.2, 0.7, 0.2, 1] as const },
});

export function Landing({ onEnter, onSignIn }: { onEnter: () => void; onSignIn: () => void }) {
  const { lang } = useTheme();
  return (
    <main className="landing">
      <LandmarkInk className="landing-art" />
      <motion.p className="brand-hi" {...rise(0.3)}>
        दिशारा
      </motion.p>
      <motion.h1 className="brand" {...rise(0.45)}>
        Dishaara
      </motion.h1>
      <motion.p className="tagline" {...rise(0.6)}>
        {t('tagline', lang)}
      </motion.p>
      <motion.p className="sub" {...rise(0.72)}>
        {t('sub', lang)}
      </motion.p>
      <motion.div className="cta-col" {...rise(0.9)}>
        <button className="btn primary big" onClick={onEnter}>
          {t('planDay', lang)} <Icon name="arrow" size={18} />
        </button>
        <button className="btn ghost" onClick={onSignIn}>
          {t('signIn', lang)}
        </button>
        <span className="muted small">{t('guestNote', lang)}</span>
      </motion.div>
      <div className="ribbons">
        <Ribbon />
        <Ribbon reverse />
      </div>
    </main>
  );
}
