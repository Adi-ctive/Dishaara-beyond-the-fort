import { LABELS } from '../core';
import { useA } from '../store';
import { Chip } from '../ui/bits';

/** Everything that is not the visitor's main path: verification, partners, how labels work. */
export default function More() {
  const a = useA();
  return (
    <div className="page more">
      <a className="card link-card" href="#/console"><h2>{a.t('consoleTitle')} →</h2><p className="muted">{a.t('more_verify')}</p></a>
      <a className="card link-card" href="#/partner"><h2>{a.t('partnerTitle')} →</h2><p className="muted">{a.t('more_partner')}</p></a>
      <section className="card">
        <h2>{a.t('more_how')}</h2>
        <p>{a.t('more_howBody')}</p>
        <div className="chips-row">{LABELS.map((l) => <Chip key={l} s={l} />)}<Chip /></div>
      </section>
      <section className="card">
        <h2>{a.t('more_about')}</h2>
        <p>{a.t('more_aboutBody')}</p>
        <p><a href="https://github.com/Adi-ctive/Dishaara-beyond-the-fort">{a.t('sourceCode')}</a></p>
        <p className="muted small">{a.t('demoBanner')}</p>
      </section>
    </div>
  );
}
