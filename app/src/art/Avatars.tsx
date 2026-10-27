// Profile art drawn in code: avatars, avatar frames and profile banners.
// Each item has an unlock rule, checked against the raahi's level, badges and passport tiers.
// Saarthis, shop owners and the team are not here for the game: every general item is open to them, and each
// role has its own items no raahi can get (a saarthi's senior frame needs 25 approved entries).
import { useId, type ReactNode } from 'react';
import { BADGES } from '../data/demo';
import { paintedArt } from './painted';

export type Unlock = { level?: number; badge?: string; tier?: string; role?: 'saarthi' | 'business' | 'moderator'; work?: number };
/** Who is looking: the roles the account holds, and for saarthis how many of their entries were approved. */
export type UnlockCtx = { roles: string[]; work?: number };
export const PARTNER = ['saarthi', 'business', 'moderator'];
type Item = { id: string; en: string; hi: string; unlock: Unlock };

// ---------------- avatars ----------------
export const AVATARS: (Item & { bg: [string, string] })[] = [
  { id: 'peacock', en: 'Peacock', hi: 'मोर', unlock: {}, bg: ['#1f6f8b', '#2bb3a6'] },
  { id: 'lotus', en: 'Lotus', hi: 'कमल', unlock: {}, bg: ['#f7c6d9', '#fde8ef'] },
  { id: 'diya', en: 'Diya', hi: 'दीया', unlock: {}, bg: ['#3a1622', '#7a2a3a'] },
  { id: 'elephant', en: 'Elephant', hi: 'हाथी', unlock: { level: 2 }, bg: ['#f2b84b', '#ffe1a1'] },
  { id: 'tabla', en: 'Tabla', hi: 'तबला', unlock: { level: 3 }, bg: ['#5b3a8a', '#9b74c8'] },
  { id: 'kite', en: 'Kite', hi: 'पतंग', unlock: { badge: 'explorer' }, bg: ['#8fd3ff', '#e8f7ff'] },
  { id: 'tiger', en: 'Tiger', hi: 'बाघ', unlock: { level: 5 }, bg: ['#2e5a3a', '#5f9a63'] },
  { id: 'fort', en: 'Fort keeper', hi: 'किले का रक्षक', unlock: { tier: 'Gwalior:gold' }, bg: ['#2b2d6e', '#f29e4c'] },
];

function AvatarArt({ id }: { id: string }): ReactNode {
  switch (id) {
    case 'peacock':
      return (
        <g>
          {[-60, -35, -12, 12, 35, 60].map((r) => (
            <g key={r} transform={`rotate(${r} 50 78)`}>
              <path d="M50 78 Q46 40 50 18 Q54 40 50 78" fill="#2bb3a6" />
              <ellipse cx="50" cy="24" rx="6" ry="8" fill="#0e4e66" />
              <ellipse cx="50" cy="25" rx="3" ry="4" fill="#f2c94c" />
            </g>
          ))}
          <path d="M44 84 Q42 62 50 56 Q58 62 56 84 Z" fill="#1d5bbf" />
          <circle cx="50" cy="54" r="7" fill="#1d5bbf" />
          <circle cx="52" cy="53" r="1.4" fill="#fff" />
          <path d="M57 54 L63 56 L57 57 Z" fill="#f2a33a" />
          <path d="M48 47 L46 41 M50 46 L50 40 M52 47 L54 41" stroke="#1d5bbf" strokeWidth="1.4" />
        </g>
      );
    case 'lotus':
      return (
        <g>
          {[-50, -25, 0, 25, 50].map((r) => (
            <path key={r} d="M50 76 Q34 52 50 26 Q66 52 50 76" fill={r === 0 ? '#e24f8a' : '#f07aa8'} transform={`rotate(${r} 50 76)`} />
          ))}
          <path d="M22 78 Q50 92 78 78 Q50 86 22 78" fill="#3f9a5c" />
          <circle cx="50" cy="66" r="5" fill="#f7d26a" />
        </g>
      );
    case 'diya':
      return (
        <g>
          <ellipse cx="50" cy="44" rx="16" ry="22" fill="#ffb547" opacity="0.35" />
          <path d="M50 30 Q60 46 50 56 Q40 46 50 30" fill="#ffd166" />
          <path d="M50 38 Q55 47 50 53 Q45 47 50 38" fill="#fff4c4" />
          <path d="M24 60 Q50 84 76 60 Z" fill="#c8552d" />
          <path d="M24 60 H76" stroke="#8a2b0f" strokeWidth="3" />
          {[34, 44, 56, 66].map((x) => <circle key={x} cx={x} cy={68} r="2" fill="#ffd166" />)}
        </g>
      );
    case 'elephant':
      return (
        <g>
          <path d="M26 56 Q22 36 40 32 Q50 24 62 32 Q80 34 76 58 Q74 70 64 72 V82 H56 V72 H44 V82 H36 V72 Q28 68 26 56Z" fill="#8a8f99" />
          <path d="M60 58 Q66 74 60 86 Q56 88 56 84 Q60 74 54 62" fill="#8a8f99" />
          <path d="M30 40 Q20 48 28 60 Q36 58 38 46 Z" fill="#b3b8c2" />
          <circle cx="56" cy="46" r="2.4" fill="#2b2b33" />
          <path d="M38 30 Q50 18 62 30" fill="none" stroke="#c8552d" strokeWidth="4" />
          <circle cx="50" cy="22" r="3" fill="#f2a33a" />
          <path d="M60 58 L66 62" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      );
    case 'tabla':
      return (
        <g>
          <path d="M22 50 Q22 42 38 42 Q54 42 54 50 L50 78 Q38 84 26 78 Z" fill="#8a4a24" />
          <ellipse cx="38" cy="46" rx="16" ry="5" fill="#f3e3c8" />
          <ellipse cx="38" cy="46" rx="6" ry="2" fill="#2b2b33" />
          <path d="M56 54 Q56 46 68 46 Q80 46 80 54 L78 76 Q68 82 58 76 Z" fill="#c9cdd6" />
          <ellipse cx="68" cy="50" rx="12" ry="4" fill="#f3e3c8" />
          <ellipse cx="68" cy="50" rx="4.5" ry="1.6" fill="#2b2b33" />
          {[28, 34, 42, 48].map((x) => <line key={x} x1={x} y1={52} x2={x - 1} y2={76} stroke="#3a1e0e" strokeWidth="1" />)}
          <path d="M70 24 Q76 22 74 30 M74 30 Q72 34 68 32" fill="none" stroke="#fff" strokeWidth="2" />
          <circle cx="67" cy="32" r="3" fill="#fff" />
        </g>
      );
    case 'kite':
      return (
        <g>
          <path d="M50 14 L76 42 L50 70 L24 42 Z" fill="#e24f4f" />
          <path d="M50 14 L76 42 L50 42 Z" fill="#f2a33a" />
          <path d="M50 42 L24 42 L50 70 Z" fill="#2b6fd6" />
          <path d="M50 14 V70 M24 42 H76" stroke="#5a1a1a" strokeWidth="1.2" />
          <path d="M50 70 Q44 80 52 86 Q60 92 50 98" fill="none" stroke="#5a1a1a" strokeWidth="1.4" />
          <path d="M46 74 L50 70 L54 74 L50 78 Z" fill="#f2a33a" />
        </g>
      );
    case 'tiger':
      return (
        <g>
          <circle cx="50" cy="54" r="28" fill="#f2953a" />
          {[[30, 32], [70, 32]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="8" fill="#f2953a" />)}
          {[[30, 32], [70, 32]].map(([x, y]) => <circle key={`i${x}`} cx={x} cy={y} r="4" fill="#ffd9b0" />)}
          <ellipse cx="50" cy="66" rx="14" ry="11" fill="#fff4e6" />
          <path d="M44 60 Q50 66 56 60 Q50 63 44 60" fill="#2b1a10" />
          {[40, 60].map((x) => <circle key={x} cx={x} cy={48} r="3" fill="#2b1a10" />)}
          {[[28, 46, 36, 50], [26, 56, 34, 58], [72, 46, 64, 50], [74, 56, 66, 58], [44, 30, 46, 38], [50, 28, 50, 36], [56, 30, 54, 38]].map(([a, b, c, d], i) => (
            <path key={i} d={`M${a} ${b} L${c} ${d}`} stroke="#2b1a10" strokeWidth="2.6" strokeLinecap="round" />
          ))}
        </g>
      );
    case 'fort':
      return (
        <g>
          <circle cx="70" cy="28" r="9" fill="#ffd27a" />
          <path d="M0 74 Q30 60 50 66 Q72 58 100 70 V100 H0Z" fill="#40335f" />
          <path d="M22 70 V48 H78 V70 Z" fill="#1f1838" />
          {[26, 42, 58, 74].map((x) => <g key={x}><rect x={x - 5} y={40} width={10} height={30} rx={2} fill="#1f1838" /><path d={`M${x - 5} 40 Q${x} 30 ${x + 5} 40 Z`} fill="#1f1838" /></g>)}
          <rect x="22" y="56" width="56" height="3" fill="#3fb5c2" />
        </g>
      );
    default:
      return <circle cx="50" cy="50" r="20" fill="#fff" />;
  }
}

export function Avatar({ id, size = 64, frame, title }: { id: string; size?: number; frame?: string; title?: string }) {
  const uid = useId().replace(/:/g, '');
  const a = AVATARS.find((x) => x.id === id) ?? AVATARS[0];
  const painted = paintedArt('avatars', a.id);
  return (
    <svg width={size} height={size} viewBox="-12 -12 124 124" className="avatar-art" role="img" aria-label={title ?? a.en}>
      <defs>
        <linearGradient id={`abg${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a.bg[0]} />
          <stop offset="1" stopColor={a.bg[1]} />
        </linearGradient>
        <clipPath id={`ac${uid}`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#abg${uid})`} />
      <g clipPath={`url(#ac${uid})`}>
        {painted ? <image href={painted} width="100" height="100" preserveAspectRatio="xMidYMid slice" /> : <AvatarArt id={a.id} />}
      </g>
      <Frame id={frame ?? 'none'} />
    </svg>
  );
}

// ---------------- frames ----------------
export const FRAMES: Item[] = [
  { id: 'none', en: 'Simple', hi: 'सादा', unlock: {} },
  { id: 'marigold', en: 'Marigold garland', hi: 'गेंदे की माला', unlock: { level: 2 } },
  { id: 'jaali', en: 'Silver jaali', hi: 'चाँदी की जाली', unlock: { level: 3 } },
  { id: 'gold', en: 'Gold filigree', hi: 'सोने की नक्काशी', unlock: { level: 5 } },
  { id: 'diwali', en: 'Diwali lights', hi: 'दीवाली की रोशनी', unlock: { badge: 'night' } },
  { id: 'peacock', en: 'Peacock crown', hi: 'मोर मुकुट', unlock: { badge: 'gem' } },
  { id: 'saarthi', en: 'Verified saarthi', hi: 'सत्यापित सारथी', unlock: { role: 'saarthi' } },
  { id: 'saarthi-senior', en: 'Senior saarthi', hi: 'वरिष्ठ सारथी', unlock: { role: 'saarthi', work: 25 } },
  { id: 'bazaar', en: 'Bazaar awning', hi: 'बाज़ार का शामियाना', unlock: { role: 'business' } },
  { id: 'team', en: 'Dishaara team', hi: 'दिशारा टीम', unlock: { role: 'moderator' } },
];

function Frame({ id }: { id: string }) {
  const around = (n: number, fn: (x: number, y: number, deg: number, i: number) => ReactNode, r = 54) =>
    Array.from({ length: n }, (_, i) => {
      const t = (i / n) * Math.PI * 2 - Math.PI / 2;
      return fn(50 + Math.cos(t) * r, 50 + Math.sin(t) * r, (t * 180) / Math.PI + 90, i);
    });
  switch (id) {
    case 'marigold':
      return (
        <g>
          <circle cx="50" cy="50" r="54" fill="none" stroke="#3f9a5c" strokeWidth="2" />
          {around(18, (x, y, _d, i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="6" fill={i % 2 ? '#f2a33a' : '#ffbe3c'} />
              <circle cx={x} cy={y} r="2.4" fill="#d9771f" />
            </g>
          ))}
        </g>
      );
    case 'jaali':
      return (
        <g>
          <circle cx="50" cy="50" r="54" fill="none" stroke="#c9ced8" strokeWidth="8" />
          <circle cx="50" cy="50" r="54" fill="none" stroke="#8d95a5" strokeWidth="1" />
          {around(24, (x, y, _d, i) => <circle key={i} cx={x} cy={y} r="2" fill="#5d6577" />)}
          {around(12, (x, y, d, i) => <path key={`p${i}`} d="M-3 0 L0 -5 L3 0 L0 5Z" fill="#eef1f6" transform={`translate(${x} ${y}) rotate(${d})`} />, 58)}
        </g>
      );
    case 'gold':
      return (
        <g>
          <circle cx="50" cy="50" r="54" fill="none" stroke="#d4af37" strokeWidth="6" />
          <circle cx="50" cy="50" r="58.5" fill="none" stroke="#8a6a12" strokeWidth="1.2" />
          {around(8, (x, y, d, i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${d})`}>
              <path d="M0 -9 Q6 -3 0 4 Q-6 -3 0 -9" fill="#f2d16b" stroke="#8a6a12" strokeWidth="0.8" />
              <circle r="2.4" fill={i % 2 ? '#c8372d' : '#1f8a70'} />
            </g>
          ))}
        </g>
      );
    case 'diwali':
      return (
        <g>
          <circle cx="50" cy="50" r="54" fill="none" stroke="#7a2a3a" strokeWidth="4" />
          {around(12, (x, y, _d, i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle r="6" fill="#ffb547" opacity="0.35" />
              <path d="M0 -6 Q4 -1 0 2 Q-4 -1 0 -6" fill="#ffd166" />
              <path d="M-4 2 Q0 6 4 2 Z" fill="#c8552d" />
            </g>
          ))}
        </g>
      );
    case 'peacock':
      return (
        <g>
          {around(14, (x, y, d, i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${d})`}>
              <path d="M0 4 Q-5 -6 0 -12 Q5 -6 0 4" fill="#2bb3a6" />
              <ellipse cy="-6" rx="2.6" ry="3.4" fill="#0e4e66" />
              <ellipse cy="-6" rx="1.2" ry="1.6" fill="#f2c94c" />
            </g>
          ), 55)}
          <circle cx="50" cy="50" r="51" fill="none" stroke="#1d5bbf" strokeWidth="2.4" />
        </g>
      );
    case 'saarthi':
    case 'saarthi-senior': {
      const ring = id === 'saarthi' ? '#2bb3a6' : '#d4af37';
      const deep = id === 'saarthi' ? '#0e4e66' : '#8a6a12';
      return (
        <g>
          <circle cx="50" cy="50" r="54" fill="none" stroke={ring} strokeWidth="6" />
          <circle cx="50" cy="50" r="58.5" fill="none" stroke={deep} strokeWidth="1.2" />
          {id === 'saarthi-senior' && around(16, (x, y, _d, i) => <circle key={i} cx={x} cy={y} r="1.8" fill="#fff3c4" />, 54)}
          <g transform="translate(50 104)">
            <circle r="11" fill={deep} stroke={ring} strokeWidth="2" />
            <path d="M-5 0 L-1.5 4 L5.5 -4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
      );
    }
    case 'bazaar':
      return (
        <g>
          <circle cx="50" cy="50" r="54" fill="none" stroke="#1f6f6b" strokeWidth="2" />
          {around(20, (x, y, d, i) => <rect key={i} x="-5" y="-6" width="10" height="12" rx="2" fill={i % 2 ? '#2bb3a6' : '#fff7ea'} stroke="#1f6f6b" strokeWidth="0.8" transform={`translate(${x} ${y}) rotate(${d})`} />)}
        </g>
      );
    case 'team':
      return (
        <g>
          <circle cx="50" cy="50" r="54" fill="none" stroke="#26346b" strokeWidth="6" />
          {around(6, (x, y, d, i) => <path key={i} d="M0 -7 L6 -4 L5 3 L0 7 L-5 3 L-6 -4Z" fill="#f0a945" stroke="#26346b" strokeWidth="1" transform={`translate(${x} ${y}) rotate(${d})`} />, 54)}
        </g>
      );
    default:
      return <circle cx="50" cy="50" r="51.5" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="3" />;
  }
}

// ---------------- banners ----------------
export const BANNERS: Item[] = [
  { id: 'dusk', en: 'Fort at dusk', hi: 'शाम का किला', unlock: {} },
  { id: 'marigold', en: 'Marigold toran', hi: 'गेंदे का तोरण', unlock: { level: 2 } },
  { id: 'monsoon', en: 'Monsoon ghats', hi: 'बारिश के घाट', unlock: { level: 4 } },
  { id: 'diwali', en: 'Diwali lanterns', hi: 'दीवाली के कंदील', unlock: { badge: 'night' } },
  { id: 'peacock', en: 'Peacock garden', hi: 'मोर बाग', unlock: { level: 6 } },
  { id: 'stars', en: 'Gwalior night', hi: 'ग्वालियर की रात', unlock: { tier: 'Gwalior:gold' } },
  { id: 'fieldnotes', en: 'Field notes', hi: 'फ़ील्ड नोट्स', unlock: { role: 'saarthi' } },
  { id: 'market', en: 'Market street', hi: 'बाज़ार की गली', unlock: { role: 'business' } },
  { id: 'control', en: 'Control room', hi: 'कंट्रोल रूम', unlock: { role: 'moderator' } },
];

export function Banner({ id, height = 120 }: { id: string; height?: number }) {
  const uid = useId().replace(/:/g, '');
  const g = (a: string, b: string) => (
    <linearGradient id={`bn${uid}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={a} />
      <stop offset="1" stopColor={b} />
    </linearGradient>
  );
  const sky = <rect width="360" height="120" fill={`url(#bn${uid})`} />;
  let body: ReactNode;
  switch (id) {
    case 'marigold':
      body = (
        <>
          <defs>{g('#fff4dc', '#ffd89a')}</defs>
          {sky}
          {[0, 1, 2].map((row) => (
            <path key={row} d={`M0 ${14 + row * 10} Q180 ${50 + row * 14} 360 ${14 + row * 10}`} fill="none" stroke="#3f9a5c" strokeWidth="1.4" opacity={0.6} />
          ))}
          {Array.from({ length: 22 }, (_, i) => {
            const x = 8 + i * 16.5;
            const y = 18 + Math.sin((i / 21) * Math.PI) * 30;
            return (
              <g key={i}>
                <line x1={x} y1={y} x2={x} y2={y + 18 + (i % 3) * 6} stroke="#3f9a5c" strokeWidth="1" />
                <circle cx={x} cy={y + 20 + (i % 3) * 6} r="5.5" fill={i % 2 ? '#f2a33a' : '#ffbe3c'} />
                <circle cx={x} cy={y + 20 + (i % 3) * 6} r="2" fill="#d9771f" />
              </g>
            );
          })}
          {[[40, 96], [120, 104], [220, 98], [310, 106]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4" fill="#f2a33a" opacity="0.7" />)}
        </>
      );
      break;
    case 'monsoon':
      body = (
        <>
          <defs>{g('#5d7a96', '#b9d0e0')}</defs>
          {sky}
          {[[60, 30], [170, 22], [280, 34]].map(([x, y]) => <g key={x} fill="#e6eef5" opacity="0.9"><circle cx={x} cy={y} r="16" /><circle cx={x + 18} cy={y + 4} r="12" /><circle cx={x - 18} cy={y + 6} r="11" /></g>)}
          {Array.from({ length: 40 }, (_, i) => <line key={i} x1={(i * 37) % 360} y1={(i * 23) % 60 + 40} x2={(i * 37) % 360 - 3} y2={(i * 23) % 60 + 48} stroke="#e6eef5" strokeWidth="1.2" opacity="0.7" />)}
          {[0, 1, 2, 3].map((i) => <rect key={i} x={0} y={92 + i * 7} width={360} height={4} fill="#7a5a3a" opacity={0.8 - i * 0.15} />)}
          <rect y="112" width="360" height="8" fill="#3a6f8a" />
        </>
      );
      break;
    case 'diwali':
      body = (
        <>
          <defs>{g('#2a0f16', '#5a1d2a')}</defs>
          {sky}
          {Array.from({ length: 9 }, (_, i) => {
            const x = 20 + i * 40;
            const len = 18 + (i % 3) * 12;
            return (
              <g key={i}>
                <line x1={x} y1={0} x2={x} y2={len} stroke="#d9a35b" strokeWidth="1" />
                <ellipse cx={x} cy={len + 12} rx="14" ry="16" fill="#ffb547" opacity="0.25" />
                <path d={`M${x - 9} ${len + 4} H${x + 9} L${x + 7} ${len + 22} H${x - 7} Z`} fill={i % 2 ? '#e8457a' : '#ffb547'} />
                <rect x={x - 10} y={len + 2} width="20" height="3" fill="#7a2a3a" />
              </g>
            );
          })}
          {[30, 110, 190, 270, 340].map((x) => <g key={x} transform={`translate(${x} 104)`}><path d="M0 -8 Q5 -2 0 2 Q-5 -2 0 -8" fill="#ffd166" /><path d="M-7 2 Q0 9 7 2Z" fill="#c8552d" /></g>)}
        </>
      );
      break;
    case 'peacock':
      body = (
        <>
          <defs>{g('#0e4e66', '#2bb3a6')}</defs>
          {sky}
          {Array.from({ length: 14 }, (_, i) => (
            <g key={i} transform={`rotate(${-70 + i * 10.8} 180 150)`}>
              <path d="M180 150 Q176 80 180 20 Q184 80 180 150" fill="#33c4b4" opacity="0.6" />
              <ellipse cx="180" cy="30" rx="9" ry="12" fill="#0b3a4c" />
              <ellipse cx="180" cy="31" rx="4" ry="5.5" fill="#f2c94c" />
            </g>
          ))}
        </>
      );
      break;
    case 'fieldnotes':
      body = (
        <>
          <defs>{g('#f5ecdd', '#e7d6b6')}</defs>
          {sky}
          {Array.from({ length: 13 }, (_, i) => <line key={`v${i}`} x1={i * 30} y1={0} x2={i * 30} y2={120} stroke="#b5552f" strokeWidth="0.5" opacity="0.35" />)}
          {Array.from({ length: 5 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 30} x2={360} y2={i * 30} stroke="#b5552f" strokeWidth="0.5" opacity="0.35" />)}
          <path d="M20 90 C80 40 140 100 200 60 S320 40 345 70" fill="none" stroke="#1f6f6b" strokeWidth="2.4" strokeDasharray="6 5" />
          {[[20, 90], [200, 60], [345, 70]].map(([x, y]) => <g key={x} transform={`translate(${x} ${y})`}><path d="M0 0 C-7 -9 -7 -16 0 -18 C7 -16 7 -9 0 0Z" fill="#b5552f" /><circle cy="-12" r="2.6" fill="#fff" /></g>)}
          <g transform="translate(300 24)"><circle r="12" fill="#1f6f6b" /><path d="M-5 0 L-1.5 4 L5.5 -4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></g>
        </>
      );
      break;
    case 'market':
      body = (
        <>
          <defs>{g('#c9ece5', '#f2fbf8')}</defs>
          {sky}
          {[0, 1, 2, 3].map((k) => (
            <g key={k} transform={`translate(${10 + k * 88} 40)`}>
              {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${i * 13} 0 h13 v14 q-6.5 6 -13 0Z`} fill={i % 2 ? (k % 2 ? '#e8962a' : '#2bb3a6') : '#fff7ea'} />)}
              <rect x="2" y="14" width="74" height="52" fill="#fff" opacity="0.85" />
              <rect x="10" y="30" width="22" height="36" fill="#1f6f6b" opacity="0.8" />
              <rect x="40" y="28" width="28" height="18" fill="#f2c94c" opacity="0.7" />
            </g>
          ))}
          <rect y="106" width="360" height="14" fill="#c7b28d" />
        </>
      );
      break;
    case 'control':
      body = (
        <>
          <defs>{g('#11152a', '#232a52')}</defs>
          {sky}
          {Array.from({ length: 24 }, (_, i) => <line key={i} x1={i * 15} y1={0} x2={i * 15} y2={120} stroke="#3a4380" strokeWidth="0.6" />)}
          {Array.from({ length: 8 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 15} x2={360} y2={i * 15} stroke="#3a4380" strokeWidth="0.6" />)}
          <path d="M0 80 L60 70 L110 84 L170 50 L230 64 L290 40 L360 52" fill="none" stroke="#f0a945" strokeWidth="2" />
          {[[170, 50], [290, 40]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="4" fill="#f0a945" />)}
          <path d="M320 14 L332 20 L330 34 L320 42 L310 34 L308 20Z" fill="#f0a945" opacity="0.9" />
        </>
      );
      break;
    case 'stars':
      body = (
        <>
          <defs>{g('#0f0d1a', '#2b2740')}</defs>
          {sky}
          {Array.from({ length: 50 }, (_, i) => <circle key={i} cx={(i * 73) % 360} cy={(i * 29) % 80} r={i % 5 ? 0.8 : 1.6} fill="#fff" opacity={0.4 + (i % 4) * 0.15} />)}
          <circle cx="300" cy="30" r="12" fill="#f1ecd2" />
          <circle cx="306" cy="26" r="11" fill="#1a1726" />
          <path d="M0 104 Q60 90 120 98 L140 88 H230 L250 98 Q300 92 360 100 V120 H0Z" fill="#000" opacity="0.8" />
          {[150, 172, 194, 216].map((x) => <rect key={x} x={x} y={80} width="10" height="10" fill="#000" opacity="0.8" />)}
          {[156, 178, 200].map((x) => <rect key={x} x={x} y={92} width="3" height="4" fill="#e9a23b" />)}
        </>
      );
      break;
    default:
      body = (
        <>
          <defs>{g('#2b2d6e', '#f29e4c')}</defs>
          {sky}
          <circle cx="290" cy="40" r="16" fill="#ffd27a" />
          <path d="M0 96 C60 80 120 92 180 84 C240 76 300 90 360 82 V120 H0Z" fill="#6c5584" opacity="0.8" />
          <g fill="#1f1838">
            <path d="M90 104 V84 H270 V104Z" />
            {[96, 132, 168, 204, 240, 264].map((x) => <g key={x}><rect x={x - 6} y={74} width="12" height="30" rx="2" /><path d={`M${x - 6} 74 Q${x} 62 ${x + 6} 74Z`} /></g>)}
          </g>
          <rect x="90" y="90" width="180" height="3" fill="#3fb5c2" />
          <path d="M0 108 C90 102 180 112 270 106 C310 104 340 108 360 106 V120 H0Z" fill="#40335f" />
        </>
      );
  }
  const painted = paintedArt('banners', id);
  return (
    <svg className="banner-art" viewBox="0 0 360 120" preserveAspectRatio="xMidYMid slice" style={{ height }} role="img" aria-hidden="true">
      {painted ? <image href={painted} width="360" height="120" preserveAspectRatio="xMidYMid slice" /> : body}
    </svg>
  );
}

export function isOpen(u: Unlock, level: number, badges: string[], tiers: string[], ctx?: UnlockCtx) {
  if (u.role) return !!ctx?.roles.includes(u.role) && (!u.work || (ctx.work ?? 0) >= u.work);
  if (ctx?.roles.some((r) => PARTNER.includes(r))) return true; // partners are not here for the game
  if (u.level && level < u.level) return false;
  if (u.badge && !badges.includes(u.badge)) return false;
  if (u.tier && !tiers.includes(u.tier)) return false;
  return true;
}

export function unlockText(u: Unlock, lang: 'en' | 'hi') {
  if (u.role === 'saarthi') return u.work ? (lang === 'hi' ? `सारथी: ${u.work} मंज़ूर एंट्री` : `Saarthi: ${u.work} approved entries`) : lang === 'hi' ? 'सिर्फ़ सारथी' : 'Saarthis only';
  if (u.role === 'business') return lang === 'hi' ? 'सिर्फ़ दुकान मालिक' : 'Shop owners only';
  if (u.role === 'moderator') return lang === 'hi' ? 'सिर्फ़ दिशारा टीम' : 'Dishaara team only';
  if (u.level) return lang === 'hi' ? `लेवल ${u.level}` : `Level ${u.level}`;
  if (u.badge) {
    const b = BADGES.find((x) => x.id === u.badge);
    return lang === 'hi' ? `बैज: ${b?.hi ?? u.badge}` : `Badge: ${b?.en ?? u.badge}`;
  }
  if (u.tier) return lang === 'hi' ? 'ग्वालियर गोल्ड' : 'Gwalior gold';
  return '';
}
