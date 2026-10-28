import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useNav } from '../nav';
import { reducedMotion } from '../theme/ThemeProvider';
import { Icon } from './Icon';

// A full-screen page that slides in over the tabs (place page, passport, settings...).
export function LayerPage({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  const { back } = useNav();
  const still = reducedMotion();
  return (
    <motion.div
      className="layer"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      initial={still ? { opacity: 0 } : { x: '100%' }}
      animate={still ? { opacity: 1 } : { x: 0 }}
      exit={still ? { opacity: 0 } : { x: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 300 }}
    >
      <div className="layer-bar">
        <button className="icon-btn" onClick={back} aria-label="Back">
          <Icon name="back" size={20} />
        </button>
        {title && <h1 className="layer-title">{title}</h1>}
        <div className="layer-actions">{actions}</div>
      </div>
      <div className="layer-body">{children}</div>
    </motion.div>
  );
}

export function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      {note && <p className="muted small section-note">{note}</p>}
      {children}
    </section>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`toggle${on ? ' on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="toggle-label">{label}</span>
      <span className="toggle-track">
        <motion.span className="toggle-knob" layout transition={{ type: 'spring', damping: 26, stiffness: 400 }} />
      </span>
    </button>
  );
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={o.v === value} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
