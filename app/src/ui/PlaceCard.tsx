import { motion } from 'motion/react';
import { checkUnit, makeLeg, people, startCoord, startName, type Place } from '../core';
import { artFor, PlaceCover } from '../art/PlaceCover';
import { StampArt, rarityOf } from '../art/Stamp';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme/ThemeProvider';
import { ConfirmWhat, LiveAlert, TrustChip, VERDICT_TEXT } from './facts';
import { Icon } from './Icon';

// R4: the place card. Each place has its own cover art and colours (src/art/PlaceCover.tsx).
export function PlaceCard({ place, i = 0 }: { place: Place; i?: number }) {
  const { data, today, s } = useStore();
  const { lang } = useTheme();
  const { open } = useNav();
  const u = place.units[0];
  const check = checkUnit(data, u, today);
  const v = check.verdict;
  const vt = VERDICT_TEXT[v];
  const fee = u.fees.v?.rows.find((r) => r.who === 'indian');
  // A disputed price is never shown as one number (Priyangi, Fact 2).
  const disputed = u.fees.s === 'conflicting';
  const feeText = fee && !disputed ? (fee.cash ?? fee.any ?? fee.online) : null;
  const rarity = rarityOf(place);
  const a = artFor(place.id);
  const got = !!s.stamps[place.id];
  const mins = u.minVisit.v;
  // How far it is from the raahi's start (their roadmap's start, else the city's first landmark), without adding it to a plan.
  const from = s.quick?.startPoint ?? data.landmarks[0]?.id;
  const leg = from ? makeLeg(data, startCoord(data, from), u.coord, { modes: s.prefs.modes.length ? s.prefs.modes : ['walk', 'auto'], walking: s.prefs.walking, budget: s.prefs.budget, insideFort: false, people: people(s.prefs.group) }) : null;
  const MODE = { walk: { en: 'on foot', hi: 'पैदल' }, auto: { en: 'by auto', hi: 'ऑटो से' }, cab: { en: 'by cab', hi: 'कैब से' } } as const;
  return (
    <motion.button
      className="place-card2"
      onClick={() => open({ kind: 'story', id: place.id })}
      style={{ ['--pc1' as string]: a.sky[0], ['--pc2' as string]: a.sky[1], ['--pca' as string]: a.accent, ['--pcink' as string]: a.ink }}
      initial={{ y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06, duration: 0.4 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
    >
      <span className="pc-cover">
        <PlaceCover id={place.id} height={118} />
        <span className="pc-shade" />
        <span className="pc-title">
          <b>{place.name[lang]}</b>
          <small>{place.type[lang]}</small>
        </span>
        <span className={`pc-stamp${got ? ' got' : ''}`}>
          <StampArt place={place} got={got} rarity={rarity} size={52} />
        </span>
        {rarity === 'rare' && <span className="pc-rare">★ {lang === 'hi' ? 'दुर्लभ स्टैम्प' : 'Rare stamp'}</span>}
      </span>
      <span className="pc-body">
        <span className="pc-row">
          <span className={`verdict ${vt.tone}`}>{vt[lang]}</span>
          {feeText !== null && feeText !== undefined && (
            <span className="pc-fact">
              <Icon name="tag" size={13} /> ₹{feeText}
            </span>
          )}
          {disputed && <span className="pc-fact warn">{lang === 'hi' ? 'कीमत पक्की नहीं' : 'Price not confirmed'}</span>}
          {mins && (
            <span className="pc-fact">
              <Icon name="clock" size={13} /> {mins}+ min
            </span>
          )}
        </span>
        {leg && from && (
          <span className="pc-travel small" title={lang === 'hi' ? 'सीधी दूरी × 1.5, तय रफ़्तार पर अनुमान' : 'Estimate: straight-line distance × 1.5 at a set speed'}>
            <Icon name="route" size={13} /> ≈ {leg.minutes} min {MODE[leg.mode][lang]} {lang === 'hi' ? 'से' : 'from'} {startName(data, from)[lang]}
            {leg.fare ? (leg.fare.max ? ` · ₹${leg.fare.min}–${leg.fare.max}` : '') : lang === 'hi' ? ' · किराया पता नहीं' : ' · fare not known'}
            {lang === 'hi' ? ' (अनुमान)' : ' (estimate)'}
          </span>
        )}
        <LiveAlert p={place} twists={s.twists} lang={lang} compact />
        <ConfirmWhat c={check} data={data} p={place} u={u} lang={lang} compact />
        <span className="pc-row between">
          <TrustChip f={u.hours} lang={lang} data={data} />
          <span className="pc-go">
            <Icon name="arrow" size={16} />
          </span>
        </span>
      </span>
    </motion.button>
  );
}
