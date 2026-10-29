// Fairs, festivals and seasons on the day being planned: exact dates, a yearly window, or a guess from last time.
import type { EventHit } from '../core';
import { useTheme } from '../theme/ThemeProvider';

const day = (d: string, hi: boolean) => new Date(d + 'T00:00:00Z').toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const span = (a: string, b: string, hi: boolean) => (a === b ? day(a, hi) : `${day(a, hi)} – ${day(b, hi)}`);

export function EventNote({ events }: { events: EventHit[] }) {
  const { lang } = useTheme();
  const hi = lang === 'hi';
  if (!events.length) return null;
  return (
    <div className="event-note" role="note">
      {events.map((e) => (
        <p key={e.id} className="small">
          <b>{e.name[lang]}</b>{e.where[lang] ? ` · ${e.where[lang]}` : ''}{e.crowd ? (hi ? ' · भीड़ रहेगी' : ' · expect crowds') : ''}
          <br />
          <span className="muted">
            {e.guess
              ? hi ? `पिछली बार ${span(e.guess.from, e.guess.to, hi)} को हुआ, इस बार भी लगभग इसी समय होने की संभावना (पुराना पैटर्न)।` : `Last held ${span(e.guess.from, e.guess.to, hi)}. Likely around the same time again (historical pattern).`
              : e.from ? `${span(e.from, e.to!, hi)} · ${e.s}` : hi ? `आमतौर पर साल के इस समय · ${e.s}` : `Usually at this time of year · ${e.s}`}
          </span>
          {e.tip && <><br /><span className="muted">{e.tip[lang]}</span></>}
          {e.watch && <><br /><span className="muted">{hi ? 'नज़र कैसे रखें: ' : 'How to keep an eye out: '}{e.watch[lang]}</span></>}
          {e.by && <><br /><span className="muted">{hi ? `सारथी ${e.by} ने जोड़ा` : `Added by saarthi ${e.by}`}</span></>}
        </p>
      ))}
    </div>
  );
}
