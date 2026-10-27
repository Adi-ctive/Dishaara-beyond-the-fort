// Line drawings that ink themselves in. Every path has pathLength=1, and CSS
// animates stroke-dashoffset from 1 to 0 with a stagger set by --i.
// All points are computed from a few measurements, so towers and arches line up exactly.

type P = { d: string; w?: number };

// Man Mandir palace on the Gwalior Fort hill: six round towers with domed chhatris,
// a tile band, arched windows between the towers, a gate in the middle.
function gwalior(): P[] {
  const ground = 160;
  const plateau = 112; // top of the hill
  const wallTop = 76;
  const left = 70;
  const right = 290;
  const towers = 6;
  const gap = (right - left) / (towers - 1);
  const tw = 9; // tower half width
  const towerTop = 62;
  const xs = Array.from({ length: towers }, (_, i) => left + i * gap);
  const out: P[] = [];

  out.push({ d: `M0 ${ground} C28 ${ground - 2} 34 ${plateau + 6} 52 ${plateau} L308 ${plateau} C326 ${plateau + 6} 332 ${ground - 2} 360 ${ground}`, w: 1.4 });
  out.push({ d: `M${left} ${plateau} V${wallTop} H${right} V${plateau}` });
  out.push({ d: `M${left} ${wallTop + 8} H${right}`, w: 0.8 }); // tile band

  for (const x of xs) {
    out.push({ d: `M${x - tw} ${plateau} V${towerTop} H${x + tw} V${plateau}` });
    out.push({ d: `M${x - tw} ${towerTop + 10} H${x + tw}`, w: 0.8 });
    // Chhatri: platform, two pillars, dome, finial.
    out.push({ d: `M${x - tw - 2} ${towerTop} H${x + tw + 2} M${x - 6} ${towerTop} V${towerTop - 6} M${x + 6} ${towerTop} V${towerTop - 6} M${x - 8} ${towerTop - 6} H${x + 8}` });
    out.push({ d: `M${x - 8} ${towerTop - 6} Q${x - 8} ${towerTop - 19} ${x} ${towerTop - 20} Q${x + 8} ${towerTop - 19} ${x + 8} ${towerTop - 6} M${x} ${towerTop - 20} V${towerTop - 25}` });
  }

  // Two arched windows in each wall section between towers.
  for (let i = 0; i < towers - 1; i++) {
    const a = xs[i] + tw;
    const b = xs[i + 1] - tw;
    const mid = (a + b) / 2;
    const middle = i === Math.floor((towers - 1) / 2);
    if (middle) {
      // Gate: a taller arch in the middle section.
      out.push({ d: `M${mid - 7} ${plateau} V${plateau - 14} Q${mid - 7} ${plateau - 24} ${mid} ${plateau - 26} Q${mid + 7} ${plateau - 24} ${mid + 7} ${plateau - 14} V${plateau}` });
      continue;
    }
    for (const c of [mid - 6, mid + 6]) {
      out.push({ d: `M${c - 3.5} ${plateau - 12} V${plateau - 20} Q${c} ${plateau - 26} ${c + 3.5} ${plateau - 20} V${plateau - 12} Z`, w: 0.9 });
    }
  }

  out.push({ d: `M8 ${ground + 4} H352`, w: 0.7 });
  return out;
}

const GWALIOR = gwalior();

export function LandmarkInk({ className = '' }: { className?: string }) {
  return (
    <svg className={`landmark ${className}`} viewBox="0 30 360 138" role="img" aria-label="Gwalior Fort, line drawing">
      <g className="ghost">
        {GWALIOR.map((p, i) => (
          <path key={i} d={p.d} pathLength={1} strokeWidth={p.w ?? 1.1} />
        ))}
      </g>
      <g className="ink">
        {GWALIOR.map((p, i) => (
          <path key={i} d={p.d} pathLength={1} strokeWidth={p.w ?? 1.1} style={{ ['--i' as string]: i }} />
        ))}
      </g>
    </svg>
  );
}
