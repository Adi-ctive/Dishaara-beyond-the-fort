// Badge medals: a ribbon, a coloured metal disc and the badge's own symbol. Grey until earned.
import { useId } from 'react';

const LOOK: Record<string, { metal: [string, string]; ribbon: [string, string]; icon: string }> = {
  explorer: { metal: ['#ffe08a', '#c98f1e'], ribbon: ['#26346b', '#e8962a'], icon: 'M50 30 L56 46 L72 50 L56 54 L50 70 L44 54 L28 50 L44 46Z' },
  gem: { metal: ['#c8f2ec', '#1f8a8a'], ribbon: ['#1d5bbf', '#2bb3a6'], icon: 'M38 42 H62 L68 50 L50 70 L32 50Z M38 42 L44 50 L50 42 L56 50 L62 42 M32 50 H68' },
  early: { metal: ['#ffd9a8', '#e8763a'], ribbon: ['#f2a33a', '#c8552d'], icon: 'M30 60 H70 M50 60 A14 14 0 0 1 36 46 M50 60 A14 14 0 0 0 64 46 M50 32 V38 M34 40 L38 44 M66 40 L62 44' },
  helper: { metal: ['#d8f0d0', '#3f9a5c'], ribbon: ['#2e8b57', '#a5c788'], icon: 'M50 68 L34 52 A8 8 0 0 1 50 40 A8 8 0 0 1 66 52Z' },
  foodie: { metal: ['#ffe3c4', '#c8552d'], ribbon: ['#c8552d', '#ffbe3c'], icon: 'M32 52 Q50 72 68 52Z M30 52 H70 M44 46 Q46 38 44 32 M52 46 Q54 38 52 32' },
  indore: { metal: ['#ffe0b3', '#d9772b'], ribbon: ['#d9772b', '#2f6f8f'], icon: 'M30 66 H70 M36 66 V48 H64 V66 M40 48 V40 H60 V48 M46 40 V34 H54 V40' },
  twocities: { metal: ['#dfe9ff', '#3d5fa8'], ribbon: ['#26346b', '#e8962a'], icon: 'M28 66 H50 V44 H38 V36 H28Z M52 66 H72 V40 L62 32 L52 40Z' },
  night: { metal: ['#d9d4ff', '#4b3a8a'], ribbon: ['#1d1a3a', '#6b3b6e'], icon: 'M58 34 A16 16 0 1 0 66 62 A13 13 0 1 1 58 34Z' },
  diwali: { metal: ['#fff0b8', '#d4a017'], ribbon: ['#7a2a3a', '#e8457a'], icon: 'M50 34 Q58 46 50 54 Q42 46 50 34Z M34 56 Q50 70 66 56Z' },
};

export function Medal({ id, earned, size = 64 }: { id: string; earned: boolean; size?: number }) {
  const uid = useId().replace(/:/g, '');
  const l = LOOK[id] ?? LOOK.explorer;
  const metal = earned ? l.metal : ['#e4e2dc', '#9a978f'];
  const ribbon = earned ? l.ribbon : ['#bdbab2', '#8e8b84'];
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 100 125" className={`medal-art${earned ? ' on' : ''}`} role="img" aria-hidden="true">
      <defs>
        <linearGradient id={`m${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={metal[0]} />
          <stop offset="1" stopColor={metal[1]} />
        </linearGradient>
      </defs>
      <path d="M30 0 H48 L52 34 L36 46Z" fill={ribbon[0]} />
      <path d="M70 0 H52 L48 34 L64 46Z" fill={ribbon[1]} />
      <circle cx="50" cy="72" r="34" fill={`url(#m${uid})`} />
      <circle cx="50" cy="72" r="34" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="2" />
      <circle cx="50" cy="72" r="27" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" strokeDasharray="2 3" />
      <g transform="translate(0 22)">
        <path d={l.icon} fill={earned ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.7)'} stroke={earned ? 'rgba(0,0,0,.28)' : 'none'} strokeWidth="1.2" strokeLinejoin="round" />
      </g>
      {earned && <path d="M24 56 Q30 46 40 44" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  );
}
