import { AnimatePresence, motion } from 'motion/react';
import { AVATARS, Avatar, BANNERS, FRAMES } from '../art/Avatars';
import { useStore } from '../store';
import { THEMES } from '../theme/themes';
import { useTheme } from '../theme/ThemeProvider';

// The moment a raahi reaches a new level: petals fall, the new level lands, unlocks are listed.
export function LevelUp() {
  const { s, set, level } = useStore();
  const { lang } = useTheme();
  const hi = lang === 'hi';
  const show = level > s.seenLevel;
  const unlocked = [
    ...AVATARS.filter((x) => x.unlock.level && x.unlock.level > s.seenLevel && x.unlock.level <= level).map((x) => `${hi ? 'अवतार' : 'Avatar'}: ${x[lang]}`),
    ...FRAMES.filter((x) => x.unlock.level && x.unlock.level > s.seenLevel && x.unlock.level <= level).map((x) => `${hi ? 'फ़्रेम' : 'Frame'}: ${x[lang]}`),
    ...BANNERS.filter((x) => x.unlock.level && x.unlock.level > s.seenLevel && x.unlock.level <= level).map((x) => `${hi ? 'बैनर' : 'Banner'}: ${x[lang]}`),
    ...THEMES.filter((t) => t.unlock.kind === 'level' && t.unlock.level > s.seenLevel && t.unlock.level <= level).map((t) => `${hi ? 'थीम' : 'Theme'}: ${t.name[lang]}`),
  ];
  const close = () => set({ seenLevel: level });
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="levelup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} role="dialog" aria-label={hi ? 'नया लेवल' : 'New level'}>
          <div className="petals" aria-hidden="true">
            {Array.from({ length: 26 }, (_, i) => (
              <motion.span
                key={i}
                style={{ left: `${(i * 37) % 100}%`, background: i % 3 ? '#f2a33a' : '#ffbe3c' }}
                initial={{ y: -40, rotate: 0, opacity: 0 }}
                animate={{ y: 700, rotate: 360 * (i % 2 ? 1 : -1), opacity: [0, 1, 1, 0] }}
                transition={{ duration: 2.4 + (i % 5) * 0.3, delay: (i % 7) * 0.12, ease: 'easeIn' }}
              />
            ))}
          </div>
          <motion.div className="levelup-card" initial={{ scale: 0.6, y: 40 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', damping: 13, stiffness: 180 }} onClick={(e) => e.stopPropagation()}>
            <Avatar id={s.look.avatar} frame={s.look.frame} size={110} />
            <p className="eyebrow">{hi ? 'बधाई हो!' : 'Well done!'}</p>
            <h2 className="display">{hi ? `लेवल ${level}` : `Level ${level}`}</h2>
            {unlocked.length > 0 ? (
              <ul className="levelup-list">
                {unlocked.map((u) => (
                  <li key={u}>🔓 {u}</li>
                ))}
              </ul>
            ) : (
              <p className="muted small">{hi ? 'और जगहें देखते रहें।' : 'Keep exploring for more unlocks.'}</p>
            )}
            <button className="btn primary" onClick={close}>{hi ? 'बढ़िया' : 'Nice'}</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
