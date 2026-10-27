import { t } from '../i18n';
import { THEMES, isUnlocked, unlockHint } from '../theme/themes';
import { useTheme } from '../theme/ThemeProvider';
import { useStore } from '../store';
import { useProgress } from '../screens/raahi/Profile';
import { Sheet } from './Sheet';
import { Icon } from './Icon';

export function ThemeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, mode, lang, setTheme, toggleMode } = useTheme();
  const { level } = useStore();
  const { tiers, ctx } = useProgress();
  const at = (e: React.MouseEvent) => ({ x: e.clientX, y: e.clientY });

  return (
    <Sheet open={open} onClose={onClose} title={t('appearance', lang)}>
      <div className="theme-grid">
        {THEMES.map((th) => {
          const open = isUnlocked(th, level, tiers, ctx.roles);
          const tk = th.dark && mode === 'dark' ? th.dark : th.light;
          const active = th.id === theme.id;
          return (
            <button
              key={th.id}
              className={`theme-tile${active ? ' active' : ''}${open ? '' : ' locked'}`}
              aria-pressed={active}
              aria-disabled={!open}
              onClick={(e) => open && !active && setTheme(th.id, at(e))}
              style={{ background: tk.bg, color: tk.ink, borderColor: active ? tk.accent : tk.line }}
            >
              <span className="theme-swatches" aria-hidden="true">
                <i style={{ background: tk.primary }} />
                <i style={{ background: tk.accent }} />
                <i style={{ background: tk.surface }} />
              </span>
              <span className="theme-name">{th.name[lang]}</span>
              <span className="theme-hint" style={{ color: tk.muted }}>
                {open ? (th.unlock.kind === 'season' ? unlockHint(th, lang) : '') : (
                  <>
                    <Icon name="lock" size={12} /> {unlockHint(th, lang)}
                  </>
                )}
              </span>
              {active && <Icon name="check" size={16} className="theme-check" />}
            </button>
          );
        })}
      </div>
      <div className="mode-row">
        {theme.dark ? (
          <button className="pill" onClick={(e) => toggleMode(at(e))}>
            <Icon name={mode === 'dark' ? 'sun' : 'moon'} size={16} />
            {mode === 'dark' ? t('light', lang) : t('dark', lang)}
          </button>
        ) : (
          <span className="muted small">{t('darkOnly', lang)}</span>
        )}
      </div>
    </Sheet>
  );
}
