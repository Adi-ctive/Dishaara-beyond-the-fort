// A small Markdown reader for Yatra's replies: paragraphs, "- " bullets, **bold** and *italic*.
// Builds React nodes, never raw HTML, so a reply cannot inject markup.
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const rx = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push(m[1] !== undefined ? <b key={`${key}b${m.index}`}>{m[1]}</b> : <i key={`${key}i${m.index}`}>{m[2]}</i>);
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] } | { kind: 'table'; rows: string[][] };

const cells = (line: string) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const li = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    const last = out[out.length - 1];
    if (line.startsWith('|')) {
      if (/^\|[\s:|-]+\|?$/.test(line)) continue; // the |---|---| line under the header
      if (last?.kind === 'table') last.rows.push(cells(line));
      else out.push({ kind: 'table', rows: [cells(line)] });
    } else if (li) {
      if (last?.kind === 'ul') last.items.push(li[1]);
      else out.push({ kind: 'ul', items: [li[1]] });
    } else out.push({ kind: 'p', text: line.replace(/^#+\s*/, '') });
  }
  return out;
}

/** Plain text of a reply, for reading it aloud. */
export const plain = (text: string) => text.replace(/\*\*|\*/g, '').replace(/^\|[\s:|-]+\|?$/gm, '').replace(/\|/g, ', ').replace(/^\s*[-•]\s+/gm, '');

export function Md({ text, animate = true }: { text: string; animate?: boolean }) {
  let n = 0;
  // Each line fades in after the one before, the way the reply is read.
  const fade = () => (animate ? { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay: n++ * 0.08, duration: 0.25 } } : {});
  return (
    <div className="md">
      {blocks(text).map((b, i) =>
        b.kind === 'p' ? (
          <motion.p key={i} {...fade()}>{inline(b.text, `p${i}`)}</motion.p>
        ) : b.kind === 'table' ? (
          <motion.div key={i} className="md-table" {...fade()}>
            <table>
              <thead>
                <tr>{b.rows[0].map((c, j) => <th key={j}>{inline(c, `h${i}-${j}`)}</th>)}</tr>
              </thead>
              <tbody>
                {b.rows.slice(1).map((r, k) => (
                  <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c, `t${i}-${k}-${j}`)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        ) : (
          <ul key={i}>
            {b.items.map((it, j) => (
              <motion.li key={j} {...fade()}>{inline(it, `l${i}-${j}`)}</motion.li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
