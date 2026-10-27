// Tap the map to drop the day's start pin. Same free tiles and theme colours as the live map.
import maplibregl, { type Map as MLMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { Tokens } from '../theme/themes';
import { paintFor } from './LiveMap';

const STYLE = 'https://tiles.openfreemap.org/styles/positron';

export function MapPicker({ center, value, tokens, onPick }: { center: [number, number]; value: [number, number] | null; tokens: Tokens; onPick: (c: [number, number]) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const pin = useRef<Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!box.current) return;
    const start = value ?? center;
    const m = new maplibregl.Map({ container: box.current, style: STYLE, center: [start[1], start[0]], zoom: 13.5, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => {
      for (const l of m.getStyle()?.layers ?? []) {
        for (const [prop, val] of Object.entries(paintFor(l.id, l.type, tokens))) {
          try {
            m.setPaintProperty(l.id, prop, val);
          } catch {
            /* a layer without that property */
          }
        }
      }
    });
    m.on('click', (e) => pick.current([e.lngLat.lat, e.lngLat.lng]));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // The map is made once; the pin follows value below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    pin.current?.remove();
    pin.current = null;
    if (!value) return;
    const el = document.createElement('div');
    el.className = 'pin start';
    el.innerHTML = '<span class="pin-dot">◆</span>';
    pin.current = new maplibregl.Marker({ element: el }).setLngLat([value[1], value[0]]).addTo(m);
  }, [value]);

  return <div ref={box} className="map-picker" />;
}
