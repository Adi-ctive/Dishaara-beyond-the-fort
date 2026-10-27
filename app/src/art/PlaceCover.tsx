// Illustrated cover for each place: its own sky, hills, landmark silhouette and colours.
// Drawn in code, so it stays sharp, loads instantly and works offline. Shapes are artistic,
// not architectural records.
import { useId } from 'react';
import { paintedArt } from './painted';
import { useStore } from '../store';

type Motif = 'gate' | 'museum' | 'fort' | 'twinTemple' | 'tallTemple' | 'gurudwara' | 'palace' | 'tomb' | 'bigTomb' | 'tank' | 'chariot' | 'generic';
export type Art = { sky: [string, string]; sun: string; far: string; near: string; land: string; accent: string; ink: string; motif: Motif; night?: boolean };

export const ART: Record<string, Art> = {
  'gwalior-fort': { sky: ['#2b2d6e', '#f29e4c'], sun: '#ffd27a', far: '#6c5584', near: '#40335f', land: '#b97a45', accent: '#3fb5c2', ink: '#1f1838', motif: 'fort' },
  // Sections inside the fort get their own scenes.
  'fort-asi': { sky: ['#2b2d6e', '#f29e4c'], sun: '#ffd27a', far: '#6c5584', near: '#40335f', land: '#b97a45', accent: '#3fb5c2', ink: '#1f1838', motif: 'fort' },
  'fort-asi-museum': { sky: ['#4a3b7a', '#e7b37a'], sun: '#fff0c2', far: '#7c6a9a', near: '#4b3a6a', land: '#c99a62', accent: '#d9a441', ink: '#2a1f45', motif: 'gate' },
  'fort-gujari': { sky: ['#e9b98a', '#fbe7c8'], sun: '#ffffff', far: '#d79d72', near: '#a8673e', land: '#e2bf8d', accent: '#3f7a8a', ink: '#5a2e18', motif: 'museum' },
  'fort-state-palaces': { sky: ['#6f5aa8', '#f4c79a'], sun: '#fff1d0', far: '#9a84c0', near: '#5c4a88', land: '#c9a070', accent: '#e9c46a', ink: '#2c2050', motif: 'palace' },
  'sas-bahu': { sky: ['#ffcf9a', '#ff8f6b'], sun: '#fff1d0', far: '#e9a07c', near: '#b4613f', land: '#d79a63', accent: '#7a3418', ink: '#5a2512', motif: 'twinTemple' },
  'teli-ka-mandir': { sky: ['#8fd3cb', '#f7e6bd'], sun: '#fffbe8', far: '#7cb4ac', near: '#4c8a82', land: '#c8a265', accent: '#6b4626', ink: '#3b2a18', motif: 'tallTemple' },
  'gurudwara-data-bandi-chhod': { sky: ['#bcdcff', '#fff3d9'], sun: '#ffffff', far: '#a9c2e4', near: '#7f9cc4', land: '#efe5d3', accent: '#e0a526', ink: '#2c3c5c', motif: 'gurudwara' },
  'jai-vilas': { sky: ['#f6b9c0', '#fff0de'], sun: '#ffffff', far: '#e7a0a8', near: '#c4757f', land: '#f2dfc6', accent: '#b8892e', ink: '#5b2b33', motif: 'palace' },
  'tansen-tomb': { sky: ['#c3e4b6', '#fff5d4'], sun: '#fffbe0', far: '#93c18f', near: '#5d985f', land: '#a5c788', accent: '#7a5a2f', ink: '#24452a', motif: 'tomb' },
  'ghaus-tomb': { sky: ['#3b2d5a', '#eaa66a'], sun: '#ffe2a8', far: '#7a5a7a', near: '#4a3655', land: '#c08a55', accent: '#e9c46a', ink: '#24182e', motif: 'bigTomb' },
  'suraj-kund': { sky: ['#ffe089', '#ff9a52'], sun: '#fff6cf', far: '#e8a76a', near: '#c07a45', land: '#d8b07a', accent: '#3a86a8', ink: '#4a2a12', motif: 'tank' },
  'sun-temple': { sky: ['#ff8a3d', '#ffd166'], sun: '#fff4c4', far: '#e57a3d', near: '#b5552a', land: '#e2a35e', accent: '#8a2b0f', ink: '#4e1a08', motif: 'chariot' },
  // Indore
  rajwada: { sky: ['#f0a35e', '#fde3b8'], sun: '#fff3d6', far: '#d98a5a', near: '#9a5636', land: '#e1b07a', accent: '#2f6f8f', ink: '#4a2412', motif: 'gate' },
  'lal-bagh': { sky: ['#e98a8a', '#ffe9d6'], sun: '#ffffff', far: '#d97b7b', near: '#a9535a', land: '#f0d7bd', accent: '#c0912f', ink: '#5a2228', motif: 'palace' },
  'central-museum': { sky: ['#7fb0c8', '#f3e6cc'], sun: '#fffbe8', far: '#6f99ae', near: '#4a7388', land: '#d4b98c', accent: '#b5702c', ink: '#24384a', motif: 'museum' },
  sarafa: { sky: ['#1d1a3a', '#6b3b6e'], sun: '#ffd27a', far: '#4b3a6a', near: '#2c2246', land: '#8a5a3a', accent: '#ffb547', ink: '#120f24', motif: 'generic', night: true },
  'kanch-mandir': { sky: ['#bfe3f0', '#f5f0ff'], sun: '#ffffff', far: '#9fc6dc', near: '#6f97b8', land: '#e6dcc8', accent: '#c9a227', ink: '#2c3c5c', motif: 'tallTemple' },
  khajrana: { sky: ['#ff9f43', '#ffe08a'], sun: '#fff4c4', far: '#ec8b3e', near: '#b9582a', land: '#e6b06a', accent: '#b8202a', ink: '#4e1a08', motif: 'tallTemple' },
  'bada-ganpati': { sky: ['#f7b267', '#fde9c9'], sun: '#fff6dc', far: '#e39a5a', near: '#b0683a', land: '#e3bf8c', accent: '#c0392b', ink: '#4a2410', motif: 'tallTemple' },
  'krishnapura-chhatri': { sky: ['#c98a5b', '#f7dfb6'], sun: '#fff1d0', far: '#b07a55', near: '#7a4a2e', land: '#6f9fb0', accent: '#2f6f8f', ink: '#3e2416', motif: 'tomb' },
  '56-dukan': { sky: ['#ff8f5a', '#ffd89a'], sun: '#fff4c4', far: '#e5774a', near: '#a9482a', land: '#e7b27a', accent: '#2e8b57', ink: '#4a1f0e', motif: 'generic' },
  'light-sound-show': { sky: ['#0f1235', '#3b2a6e'], sun: '#ffd27a', far: '#2a2350', near: '#17142e', land: '#3a2d55', accent: '#ffcf5a', ink: '#0b0a1c', motif: 'fort', night: true },
  'tighra-dam': { sky: ['#8ecae6', '#e8f6ff'], sun: '#ffffff', far: '#7fb3c9', near: '#3f7f9a', land: '#5aa0b8', accent: '#2e6f8a', ink: '#1f3f4f', motif: 'tank' },
  'db-city-mall': { sky: ['#5f6fd8', '#c7d0ff'], sun: '#ffffff', far: '#8a96e0', near: '#4c58b0', land: '#c3c8e6', accent: '#ff8a3d', ink: '#1f2660', motif: 'museum' },
  'phool-bagh': { sky: ['#bfe6a8', '#f4ffe8'], sun: '#ffffff', far: '#8cc58a', near: '#4f9a5c', land: '#9fd08a', accent: '#e85d8a', ink: '#24452a', motif: 'generic' },
  'phoenix-citadel': { sky: ['#3d4ab8', '#b9c3ff'], sun: '#ffffff', far: '#7b86d6', near: '#3a46a0', land: '#c8cbe8', accent: '#ff6b6b', ink: '#141a52', motif: 'museum' },
  'treasure-island': { sky: ['#2f8fa8', '#c9f1f7'], sun: '#ffffff', far: '#6fb7c7', near: '#2f7f92', land: '#c4e2e8', accent: '#ffb547', ink: '#123a44', motif: 'museum' },
  'meghdoot-garden': { sky: ['#a8e0b0', '#f2fff2'], sun: '#ffffff', far: '#7fc58e', near: '#3f8f55', land: '#9bd49c', accent: '#f2a33a', ink: '#1f4a2a', motif: 'generic' },
  mrignayani: { sky: ['#f7b267', '#fff0d6'], sun: '#ffffff', far: '#e39a5a', near: '#b0683a', land: '#efcf9e', accent: '#7a2a8a', ink: '#4a2410', motif: 'museum' },
  'gulawat-lotus-valley': { sky: ['#ffc2d4', '#fff1f5'], sun: '#ffffff', far: '#e7a0b8', near: '#5c9a7a', land: '#7cc0a8', accent: '#e85d8a', ink: '#2a4a3a', motif: 'tank' },
  ralamandal: { sky: ['#9ccf8a', '#eaf7d8'], sun: '#fffbe0', far: '#6fa863', near: '#3c7a3e', land: '#7fb26a', accent: '#c98a3a', ink: '#1f3f20', motif: 'generic' },
  patalpani: { sky: ['#7ec8e3', '#e6f7ff'], sun: '#ffffff', far: '#5f9a7a', near: '#3d6f55', land: '#7fb8c9', accent: '#ffffff', ink: '#1f3a2e', motif: 'tank' },
  'choral-dam': { sky: ['#a3c9f0', '#eef6ff'], sun: '#ffffff', far: '#7da7cf', near: '#4a78a8', land: '#6fa0c8', accent: '#2e5f8a', ink: '#1a3048', motif: 'tank' },
  annapurna: { sky: ['#f6c177', '#fff0d4'], sun: '#ffffff', far: '#e2a868', near: '#b77b44', land: '#ecd2a6', accent: '#2e8b57', ink: '#4a2c12', motif: 'tallTemple' },
};

const FALLBACK: Art = { sky: ['#c9d6ff', '#fff2dc'], sun: '#ffffff', far: '#a8b4d8', near: '#7d8ab3', land: '#e6d6bd', accent: '#e8962a', ink: '#26346b', motif: 'generic' };
export const artFor = (id: string) => ART[id] ?? FALLBACK;

function Landmark({ m, a }: { m: Motif; a: Art }) {
  const c = a.ink;
  switch (m) {
    case 'fort':
      return (
        <g fill={c}>
          <path d="M70 104 V76 H290 V104 Z" />
          {[78, 122, 166, 210, 254, 282].map((x) => (
            <g key={x}>
              <rect x={x - 8} y={66} width={16} height={38} rx={3} />
              <path d={`M${x - 8} 66 Q${x} 50 ${x + 8} 66 Z`} />
              <rect x={x - 1} y={46} width={2} height={6} />
            </g>
          ))}
          <rect x={70} y={84} width={220} height={4} fill={a.accent} />
          {[100, 144, 188, 232].map((x) => (
            <path key={x} d={`M${x - 4} 100 V93 Q${x} 87 ${x + 4} 93 V100 Z`} fill={a.sun} opacity={0.75} />
          ))}
        </g>
      );
    case 'gate':
      return (
        <g fill={c}>
          <path d="M110 104 V54 H250 V104 H206 V78 Q180 46 154 78 V104 Z" />
          {[118, 242].map((x) => <g key={x}><rect x={x - 10} y={40} width={20} height={64} /><path d={`M${x - 12} 40 Q${x} 24 ${x + 12} 40 Z`} /></g>)}
          <g transform="translate(180 96)" fill={a.accent}>
            <ellipse cx="0" cy="-6" rx="12" ry="8" />
            <rect x="-10" y="-2" width="4" height="8" /><rect x="6" y="-2" width="4" height="8" />
            <path d="M-12 -6 Q-20 0 -16 8" stroke={a.accent} strokeWidth="3" fill="none" />
          </g>
          {[136, 224].map((x) => <rect key={x} x={x - 6} y={64} width={12} height={4} fill={a.accent} />)}
        </g>
      );
    case 'museum':
      return (
        <g fill={c}>
          <rect x={100} y={58} width={160} height={46} />
          <rect x={96} y={52} width={168} height={7} />
          {Array.from({ length: 7 }, (_, i) => 112 + i * 22).map((x) => (
            <path key={x} d={`M${x} 100 V80 Q${x + 7} 70 ${x + 14} 80 V100 Z`} fill={a.sun} opacity={0.55} />
          ))}
          <path d="M150 52 Q180 30 210 52 Z" />
          <rect x={100} y={66} width={160} height={3} fill={a.accent} />
        </g>
      );
    case 'twinTemple':
      return (
        <g fill={c}>
          <path d="M120 104 V82 H160 V104 Z M200 104 V86 H236 V104 Z" />
          <path d="M124 82 L140 34 L156 82 Z M203 86 L218 48 L233 86 Z" />
          {[50, 60, 70].map((y) => <rect key={y} x={128 + (y - 50) / 5} y={y} width={24 - (y - 50) / 2.5} height={3} fill={a.accent} opacity={0.5} />)}
          <circle cx={140} cy={32} r={3} /> <circle cx={218} cy={46} r={3} />
          <rect x={110} y={102} width={136} height={4} />
        </g>
      );
    case 'tallTemple':
      return (
        <g fill={c}>
          <path d="M150 104 V40 H210 V104 Z" />
          <path d="M146 42 Q180 14 214 42 Z" />
          {[52, 64, 76, 88].map((y) => <rect key={y} x={156} y={y} width={48} height={2.5} fill={a.accent} opacity={0.55} />)}
          <path d="M172 104 V86 Q180 78 188 86 V104 Z" fill={a.sun} opacity={0.8} />
          <rect x={136} y={102} width={88} height={4} />
        </g>
      );
    case 'gurudwara':
      return (
        <g>
          <rect x={130} y={64} width={100} height={40} fill="#ffffff" />
          <path d="M150 64 Q180 22 210 64 Z" fill={a.accent} />
          <rect x={178} y={20} width={4} height={10} fill={a.accent} />
          {[136, 214].map((x) => <path key={x} d={`M${x} 64 Q${x + 5} 52 ${x + 10} 64 Z`} fill={a.accent} />)}
          {[146, 166, 186, 206].map((x) => <path key={x} d={`M${x} 104 V88 Q${x + 4} 82 ${x + 8} 88 V104 Z`} fill={a.near} />)}
          <rect x={120} y={102} width={120} height={4} fill={a.near} />
        </g>
      );
    case 'palace':
      return (
        <g>
          <rect x={92} y={60} width={176} height={44} fill="#fffaf2" />
          <rect x={92} y={56} width={176} height={6} fill={a.accent} />
          {Array.from({ length: 8 }, (_, i) => 104 + i * 20).map((x) => (
            <path key={x} d={`M${x} 100 V78 Q${x + 6} 68 ${x + 12} 78 V100 Z`} fill={a.near} opacity={0.75} />
          ))}
          <path d="M160 56 Q180 36 200 56 Z" fill="#fffaf2" />
          <rect x={86} y={102} width={188} height={4} fill={a.accent} />
        </g>
      );
    case 'tomb':
      return (
        <g fill={c}>
          <rect x={140} y={68} width={80} height={36} />
          <path d="M150 68 Q180 30 210 68 Z" />
          <rect x={178} y={28} width={4} height={8} />
          {[132, 222].map((x) => <rect key={x} x={x - 4} y={60} width={8} height={44} />)}
          <path d="M172 104 V88 Q180 80 188 88 V104 Z" fill={a.sun} opacity={0.8} />
          {[[96, 40], [110, 28], [250, 34], [262, 22]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`} fill={a.accent}>
              <ellipse cx={0} cy={10} rx={4} ry={3} />
              <rect x={3} y={-4} width={1.6} height={14} />
            </g>
          ))}
        </g>
      );
    case 'bigTomb':
      return (
        <g fill={c}>
          <rect x={120} y={66} width={120} height={38} />
          <path d="M140 66 Q180 16 220 66 Z" />
          {[124, 236].map((x) => <g key={x}><rect x={x - 6} y={52} width={12} height={52} /><path d={`M${x - 8} 52 Q${x} 40 ${x + 8} 52 Z`} /></g>)}
          {[136, 156, 196, 216].map((x) => (
            <g key={x} fill={a.accent} opacity={0.75}>
              {[0, 1, 2].map((r) => [0, 1].map((col) => <circle key={`${r}${col}`} cx={x + 3 + col * 6} cy={78 + r * 7} r={1.6} />))}
            </g>
          ))}
          <path d="M172 104 V84 Q180 76 188 84 V104 Z" fill={a.sun} opacity={0.85} />
        </g>
      );
    case 'tank':
      return (
        <g>
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M${70 + i * 18} ${78 + i * 7} H${290 - i * 18} L${282 - i * 18} ${84 + i * 7} H${78 + i * 18} Z`} fill={a.ink} opacity={0.85 - i * 0.12} />
          ))}
          <path d="M140 106 H220 L214 112 H146 Z" fill={a.accent} />
          <ellipse cx={180} cy={108} rx={18} ry={2} fill={a.sun} opacity={0.9} />
          <rect x={172} y={52} width={16} height={26} fill={a.ink} />
          <path d="M168 52 Q180 38 192 52 Z" fill={a.ink} />
        </g>
      );
    case 'chariot':
      return (
        <g fill={c}>
          <path d="M130 92 V58 H230 V92 Z" />
          <path d="M140 58 L180 22 L220 58 Z" />
          {[150, 210].map((x) => (
            <g key={x} transform={`translate(${x} 96)`}>
              <circle r={14} fill="none" stroke={c} strokeWidth={4} />
              <circle r={3} />
              {Array.from({ length: 8 }, (_, i) => i * 45).map((d) => <rect key={d} x={-1} y={-13} width={2} height={13} transform={`rotate(${d})`} />)}
            </g>
          ))}
          {[96, 254].map((x) => (
            <path key={x} d={`M${x} 104 L${x + (x < 180 ? 10 : -10)} 78 L${x + (x < 180 ? 22 : -22)} 74 L${x + (x < 180 ? 18 : -18)} 90 L${x + (x < 180 ? 26 : -26)} 104 Z`} fill={a.accent} />
          ))}
        </g>
      );
    default:
      return <path d="M150 104 V60 Q180 30 210 60 V104 Z" fill={c} />;
  }
}

/** A cover scene. height is in CSS pixels; the art keeps its proportions and crops to fit. */
export function PlaceCover({ id, height = 110, className = '' }: { id: string; height?: number; className?: string }) {
  const a = artFor(id);
  const uid = useId().replace(/:/g, '');
  // A real photo of the place (Wikimedia Commons, credited on its page) beats drawn art. Stamps keep the art.
  let photo: string | undefined;
  try {
    photo = useStore().data.places.find((p) => p.id === id)?.photo?.img;
  } catch {
    photo = undefined; // outside the store (tests, previews): drawn art
  }
  if (photo) return <img className={`place-cover photo ${className}`} src={photo} alt="" aria-hidden="true" loading="lazy" style={{ height, background: a.sky[1] }} />;
  const painted = paintedArt('covers', id);
  if (painted) {
    // Painted covers are 2:1. Same svg box as the drawn ones, so every screen's sizing still works.
    return (
      <svg className={`place-cover painted ${className}`} viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice" style={{ height, background: a.sky[1] }} role="img" aria-hidden="true">
        <image href={painted} width="360" height="180" preserveAspectRatio="xMidYMid slice" />
      </svg>
    );
  }
  return (
    <svg className={`place-cover ${className}`} viewBox="0 0 360 120" preserveAspectRatio="xMidYMax slice" style={{ height }} role="img" aria-hidden="true">
      <defs>
        <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a.sky[0]} />
          <stop offset="1" stopColor={a.sky[1]} />
        </linearGradient>
        <radialGradient id={`glow${uid}`}>
          <stop offset="0" stopColor={a.sun} stopOpacity="0.9" />
          <stop offset="1" stopColor={a.sun} stopOpacity="0" />
        </radialGradient>
        <pattern id={`jaali${uid}`} width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="0.9" fill="#ffffff" opacity="0.18" />
        </pattern>
      </defs>
      <rect width="360" height="120" fill={`url(#sky${uid})`} />
      <circle cx="292" cy="34" r="40" fill={`url(#glow${uid})`} />
      <circle cx="292" cy="34" r="13" fill={a.sun} />
      {[[40, 26], [58, 20], [74, 30]].map(([x, y]) => (
        <path key={x} d={`M${x} ${y} q4 -4 8 0 q4 -4 8 0`} fill="none" stroke={a.ink} strokeWidth="1.4" opacity="0.45" />
      ))}
      <path d="M0 92 C40 70 80 84 120 74 C170 62 210 80 250 70 C300 58 330 74 360 66 V120 H0 Z" fill={a.far} opacity="0.75" />
      <Landmark m={a.motif} a={a} />
      <path d="M0 104 C60 98 120 108 180 102 C240 96 300 106 360 100 V120 H0 Z" fill={a.near} />
      <path d="M0 112 C70 108 140 116 220 110 C280 106 320 112 360 110 V120 H0 Z" fill={a.land} />
      <rect width="360" height="120" fill={`url(#jaali${uid})`} />
    </svg>
  );
}
