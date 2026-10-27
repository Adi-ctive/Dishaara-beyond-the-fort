// Small pickers shared by setup and trip planning: a +/- counter and multi-select chips.
import { Icon } from './Icon';

export function Counter({ label, note, value, min, onChange }: { label: string; note?: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <div className="counter">
      <span className="grow">
        <b>{label}</b>
        {note && <small className="muted">{note}</small>}
      </span>
      <button className="icon-btn" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`${label} −`} disabled={value <= min}>−</button>
      <b className="counter-n">{value}</b>
      <button className="icon-btn" onClick={() => onChange(Math.min(15, value + 1))} aria-label={`${label} +`}>+</button>
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange }: { value: T[]; options: { v: T; label: string }[]; onChange: (v: T[]) => void }) {
  return (
    <div className="chip-row">
      {options.map((o) => {
        const on = value.includes(o.v);
        return (
          <button key={o.v} className={`chip big${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.v) : [...value, o.v])}>
            {on && <Icon name="check" size={14} />} {o.label}
          </button>
        );
      })}
    </div>
  );
}
