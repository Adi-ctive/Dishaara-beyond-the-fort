// Illustrations for Bazaar listings: a small icon per kind, and a cover scene per kind.
import { useId } from 'react';
import type { Shop } from '../api';

type Kind = Shop['kind'];

const ICON: Record<Kind, string> = {
  food: 'M6 14 Q16 26 26 14Z M5 14 H27 M12 10 Q13 6 12 3 M17 10 Q18 6 17 3 M22 10 Q23 6 22 3',
  craft: 'M8 24 L20 12 M18 8 L24 14 L22 16 L16 10Z M8 24 L6 26 M24 22 Q26 18 24 16',
  shop: 'M5 12 L8 5 H24 L27 12 M5 12 H27 V26 H5Z M5 12 Q9 16 13 12 Q17 16 21 12 Q25 16 27 12 M13 26 V19 H19 V26',
  stay: 'M4 26 V12 L16 4 L28 12 V26Z M11 26 V18 H21 V26 M14 12 H18',
  guide: 'M16 10 A4 4 0 1 0 16 2 A4 4 0 1 0 16 10 M8 28 Q8 14 16 14 Q24 14 24 28 M22 18 L28 12 M26 12 H28 V14',
  activity: 'M16 3 L19.5 11 L28 12 L21.5 18 L23.5 27 L16 22.5 L8.5 27 L10.5 18 L4 12 L12.5 11Z',
};

export function BizIcon({ kind, size = 22 }: { kind: Kind; size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d={ICON[kind]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PAL: Record<Kind, { sky: [string, string]; main: string; awning: [string, string]; ground: string }> = {
  food: { sky: ['#ffd3a8', '#fff1de'], main: '#b5552a', awning: ['#e8457a', '#fff'], ground: '#d8a46a' },
  craft: { sky: ['#d8cff2', '#f6f2ff'], main: '#5b3a8a', awning: ['#7a5cc2', '#f2c94c'], ground: '#b9a98a' },
  shop: { sky: ['#c9ece5', '#f2fbf8'], main: '#1f6f6b', awning: ['#2bb3a6', '#fff'], ground: '#c7b28d' },
  stay: { sky: ['#cfe0fa', '#f4f8ff'], main: '#2b5ea8', awning: ['#e8962a', '#fff'], ground: '#c9b48e' },
  guide: { sky: ['#f6e3b4', '#fffaf0'], main: '#8a5a1f', awning: ['#d98c2b', '#fff'], ground: '#c9ad7f' },
  activity: { sky: ['#bfe6f2', '#f0fbff'], main: '#1d6a8a', awning: ['#2f9bd1', '#fff'], ground: '#b8c98e' },
};

/** A storefront scene for the listing page header. */
export function BizCover({ kind, height = 150 }: { kind: Kind; height?: number }) {
  const uid = useId().replace(/:/g, '');
  const p = PAL[kind];
  const stripes = Array.from({ length: 10 }, (_, i) => i);
  return (
    <svg viewBox="0 0 360 120" preserveAspectRatio="xMidYMax slice" style={{ height, width: '100%', display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id={`bs${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="1" stopColor={p.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="360" height="120" fill={`url(#bs${uid})`} />
      <rect x="0" y="104" width="360" height="16" fill={p.ground} />
      <rect x="90" y="40" width="180" height="66" fill={p.main} />
      {stripes.map((i) => (
        <path key={i} d={`M${90 + i * 18} 40 h18 l-2 16 q-7 6 -14 0 Z`} fill={i % 2 ? p.awning[1] : p.awning[0]} />
      ))}
      <rect x="104" y="64" width="64" height="42" fill="#fff" opacity="0.9" />
      <rect x="192" y="64" width="64" height="30" fill="#fff" opacity="0.9" />
      {kind === 'food' && [0, 1, 2].map((i) => <ellipse key={i} cx={120 + i * 16} cy={86} rx="7" ry="4" fill="#e8a43a" />)}
      {kind === 'craft' && [0, 1, 2].map((i) => <path key={i} d={`M${114 + i * 18} 98 l6 -18 l6 18 Z`} fill="#8a7a60" />)}
      {kind === 'shop' && [0, 1, 2, 3].map((i) => <rect key={i} x={110 + i * 14} y={74} width="9" height="22" fill={i % 2 ? '#d9a441' : '#2bb3a6'} />)}
      {kind === 'stay' && <path d="M120 98 V80 Q136 66 152 80 V98 Z" fill="#c9a06a" />}
      <rect x="200" y="70" width="48" height="4" fill={p.main} opacity="0.4" />
      <rect x="200" y="80" width="34" height="4" fill={p.main} opacity="0.4" />
      <circle cx="310" cy="30" r="12" fill="#fff6d0" />
    </svg>
  );
}
