// City switch in the top bar. The app also switches by itself when location is on.
import { CITY_IDS, SEEDS } from '../core';
import { useStore } from '../store';
import { useTheme } from '../theme/ThemeProvider';

export function CityPick() {
  const { s, setCity } = useStore();
  const { lang } = useTheme();
  return (
    <label className="city-pick">
      <span className="sr-only">{lang === 'hi' ? 'शहर' : 'City'}</span>
      <select value={s.city} onChange={(e) => setCity(e.target.value as typeof s.city)}>
        {CITY_IDS.map((c) => (
          <option key={c} value={c}>
            {SEEDS[c].city.name[lang]}
          </option>
        ))}
      </select>
    </label>
  );
}
