// Theme ornaments, drawn in SVG. Colours come from the theme tokens.
import type { Ornament } from '../theme/themes';

// A marigold garland (toran) hanging across the top of the screen.
function Toran() {
  const flowers = Array.from({ length: 15 }, (_, i) => i);
  return (
    <svg className="ornament toran" viewBox="0 0 390 34" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 4 Q97 26 195 8 T390 4" fill="none" stroke="var(--primary)" strokeWidth="1.2" opacity=".5" />
      {flowers.map((i) => {
        const x = 13 + i * 26;
        const y = 6 + Math.sin((i / 14) * Math.PI * 2) * 6 + 8;
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <line x1="0" y1="0" x2="0" y2={i % 2 ? 8 : 12} stroke="var(--primary)" strokeWidth=".8" opacity=".5" />
            <circle cy={i % 2 ? 11 : 15} r="4.2" fill="var(--accent)" />
            <circle cy={i % 2 ? 11 : 15} r="2" fill="var(--bg)" opacity=".35" />
          </g>
        );
      })}
    </svg>
  );
}

// Rangoli corner for the Diwali theme.
function Rangoli() {
  const petals = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg className="ornament rangoli" viewBox="-40 -40 80 80" aria-hidden="true">
      {petals.map((a) => (
        <path key={a} d="M0 0 Q8 -14 0 -30 Q-8 -14 0 0" fill="var(--accent)" opacity=".85" transform={`rotate(${a})`} />
      ))}
      {petals.map((a) => (
        <path key={`i${a}`} d="M0 0 Q5 -9 0 -18 Q-5 -9 0 0" fill="var(--primary)" transform={`rotate(${a + 22.5})`} />
      ))}
      <circle r="5" fill="var(--bg)" />
      <circle r="2.5" fill="var(--primary)" />
    </svg>
  );
}

// A row of jharokha arches.
function Arch() {
  return (
    <svg className="ornament arch" viewBox="0 0 390 22" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: 13 }, (_, i) => (
        <path key={i} d={`M${i * 30 + 3} 22 V12 Q${i * 30 + 15} -2 ${i * 30 + 27} 12 V22`} fill="none" stroke="var(--accent)" strokeWidth="1.3" opacity=".55" />
      ))}
    </svg>
  );
}

function Stars() {
  return (
    <svg className="ornament stars" viewBox="0 0 390 30" preserveAspectRatio="none" aria-hidden="true">
      {[18, 70, 130, 205, 260, 330, 372].map((x, i) => (
        <circle key={x} cx={x} cy={6 + ((i * 7) % 18)} r={i % 3 ? 1 : 1.7} fill="var(--primary)" />
      ))}
    </svg>
  );
}

export function OrnamentTop({ kind }: { kind: Ornament }) {
  if (kind === 'toran') return <Toran />;
  if (kind === 'arch') return <Arch />;
  if (kind === 'stars') return <Stars />;
  if (kind === 'rangoli')
    return (
      <div className="rangoli-pair" aria-hidden="true">
        <Rangoli />
        <Rangoli />
      </div>
    );
  return null;
}
