// A passport stamp for one place, made to be collected: a serrated postage edge in the rarity's colour,
// a round window with the place's painted cover (or its drawn colours and motif), the name on a ribbon,
// and the date it was earned. Not yet collected: greyed out with a lock.
import { useId } from 'react';
import type { Place } from '../core';
import { artFor } from './PlaceCover';
import { paintedArt } from './painted';

export type Rarity = 'rare' | 'common' | 'plain';

export function rarityOf(p: Place): Rarity {
  if (p.sensitive || p.guardrail.status === 'notEligible' || p.guardrail.status === 'withdrawn') return 'plain';
  return p.lesserKnown ? 'rare' : 'common';
}

const MOTIFS: Record<string, string> = {
  fort: 'M-18 10V-6h7v-6h4v6h14v-6h4v6h7v16M-3 10V2a3 3 0 0 1 6 0v8',
  temple: 'M-14 12h28M-11 12V4h22v8M-8 4l3-10h10l3 10M-4-6L0-16l4 10M0-16v-4',
  tomb: 'M-14 12h28M-12 12V0h24v12M-10 0a10 10 0 0 1 20 0M0-10v-5M-5 12V5h10v7',
  music: 'M-6 10a7 7 0 1 0 0.1 0M-2 4L10-14M8-16l4 3',
  palace: 'M-16 12h32M-16 12V-2h32v14M-12 12V5a3 3 0 0 1 6 0v7M-3 12V5a3 3 0 0 1 6 0v7M6 12V5a3 3 0 0 1 6 0v7M-16-2l16-10 16 10',
  water: 'M-16-8h32M-13-3h26M-10 2h20M-7 7h14M-12 12c4-3 8 3 12 0s8-3 12 0',
  sun: 'M0-6a6 6 0 1 0 0.1 0M0-16v4M0 8v4M-14-2h4M10-2h4M-10-12l3 3M7 5l3 3M10-12l-3 3M-7 5l-3 3',
  food: 'M-12 2h24a12 10 0 0 1-24 0M-8-4c0-4 4-4 4-8M0-4c0-4 4-4 4-8M8-4c0-4 4-4 4-8',
};

function motifFor(p: Place): string {
  const id = p.id;
  if (id.includes('fort')) return MOTIFS.fort;
  if (id.includes('kund')) return MOTIFS.water;
  if (id.includes('sun')) return MOTIFS.sun;
  if (p.tags.includes('food')) return MOTIFS.food;
  if (id.includes('vilas') || id.includes('rajwada') || id.includes('lal-bagh') || id.includes('museum')) return MOTIFS.palace;
  if (p.tags.includes('music')) return MOTIFS.music;
  if (id.includes('tomb') || id.includes('chhatri')) return MOTIFS.tomb;
  return MOTIFS.temple;
}

const RIM: Record<Rarity, [string, string]> = {
  rare: ['#f6d77a', '#b8862b'], // gold
  common: ['', ''], // the place's own colours
  plain: ['#e3e6ec', '#9aa1ad'], // silver
};

export function StampArt({ place, got, rarity, size = 96, date }: { place: Place; got: boolean; rarity: Rarity; size?: number; date?: string }) {
  const id = useId().replace(/:/g, '');
  const a = artFor(place.id);
  const painted = paintedArt('covers', place.id);
  const [rimA, rimB] = rarity === 'common' ? [a.sky[1], a.accent] : RIM[rarity];
  const name = place.name.en.toUpperCase();
  const teeth = 28;
  // Serrated postage edge: a circle with small bites taken out all round.
  const edge = Array.from({ length: teeth }, (_, i) => {
    const t = (i / teeth) * Math.PI * 2;
    return `M${(48 * Math.cos(t)).toFixed(2)} ${(48 * Math.sin(t)).toFixed(2)}m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0`;
  }).join('');
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" className={`stamp-art${got ? ' got' : ''}`} role="img" aria-label={`${place.name.en} stamp${got ? '' : ', not collected'}`}>
      <defs>
        <linearGradient id={`rim${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={rimA} />
          <stop offset="1" stopColor={rimB} />
        </linearGradient>
        <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a.sky[0]} />
          <stop offset="1" stopColor={a.sky[1]} />
        </linearGradient>
        <clipPath id={`win${id}`}>
          <circle r="27" />
        </clipPath>
        <mask id={`bite${id}`}>
          <rect x="-50" y="-50" width="100" height="100" fill="#fff" />
          <path d={edge} fill="#000" />
        </mask>
        <filter id={`grey${id}`}>
          <feColorMatrix type="saturate" values="0.05" />
        </filter>
        <path id={`ring${id}`} d="M-36 0a36 36 0 1 1 72 0a36 36 0 1 1-72 0" />
        <radialGradient id={`shine${id}`} cx="0.3" cy="0.25" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform={got ? `rotate(${((place.id.length * 7) % 14) - 7})` : undefined} filter={got ? undefined : `url(#grey${id})`} opacity={got ? 1 : 0.55}>
        <circle r="48" fill={`url(#rim${id})`} mask={`url(#bite${id})`} />
        <circle r="43" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.8" strokeDasharray="1.5 2" />
        <circle r="30.5" fill={a.ink} />
        <g clipPath={`url(#win${id})`}>
          <rect x="-27" y="-27" width="54" height="54" fill={`url(#sky${id})`} />
          {painted ? (
            <image href={painted} x="-40" y="-27" width="80" height="54" preserveAspectRatio="xMidYMid slice" />
          ) : (
            <>
              <path d="M-27 12c10-6 20 2 30-3s16 3 24-1V27h-54z" fill={a.near} />
              <path d={motifFor(place)} transform="translate(0 -2) scale(1.1)" fill="none" stroke={a.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
          {got && <circle r="27" fill={`url(#shine${id})`} />}
        </g>
        <text fontSize="7.2" fontWeight="800" letterSpacing="1.2" fill={rarity === 'plain' ? '#3d4452' : '#fff'} style={{ fontFamily: 'var(--sans)' }}>
          <textPath href={`#ring${id}`} startOffset="25%" textAnchor="middle">
            {name.length > 24 ? name.slice(0, 23) + '…' : name}
          </textPath>
        </text>
        {got && date && (
          <g transform="translate(0 30)">
            <rect x="-17" y="-6" width="34" height="11" rx="2" fill={a.ink} />
            <text y="2.6" fontSize="6.6" fontWeight="700" textAnchor="middle" fill="#fff" style={{ fontFamily: 'var(--sans)' }}>
              {date}
            </text>
          </g>
        )}
        {rarity === 'rare' && (
          // Rare: a star on the rim at the bottom, clear of the name.
          <path d="M0-46l2.1 4.4 4.8.6-3.5 3.3.9 4.8L0-35.2l-4.3 2.3.9-4.8-3.5-3.3 4.8-.6z" transform="translate(0 82)" fill="#fff6d0" stroke="#8a5a00" strokeWidth="0.6" />
        )}
      </g>
      {!got && (
        <g transform="translate(0 2)" fill="#fff" stroke="#3d4452" strokeWidth="1.4">
          <rect x="-7" y="-3" width="14" height="11" rx="2" />
          <path d="M-4-3v-3a4 4 0 0 1 8 0v3" fill="none" />
        </g>
      )}
    </svg>
  );
}
