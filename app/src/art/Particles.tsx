// Light theme effects. Few elements, CSS only, off when the user asks for less motion.
import type { Particles as Kind } from '../theme/themes';

export function Particles({ kind }: { kind: Kind }) {
  if (kind === 'none') return null;
  const n = kind === 'stars' ? 22 : 12;
  return (
    <div className={`particles ${kind}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        // Fixed spread so every screen looks the same.
        const left = (i * 37 + 11) % 100;
        const delay = (i * 1.7) % 9;
        const dur = 9 + ((i * 5) % 7);
        const size = 0.7 + ((i * 3) % 5) / 10;
        return (
          <span
            key={i}
            style={{
              left: `${left}%`,
              top: kind === 'stars' ? `${(i * 23) % 60}%` : undefined,
              animationDelay: `${delay}s`,
              animationDuration: `${kind === 'stars' ? dur / 3 : dur}s`,
              ['--s' as string]: size,
            }}
          />
        );
      })}
    </div>
  );
}
