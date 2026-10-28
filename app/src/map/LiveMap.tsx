// The real map: MapLibre with free OpenFreeMap vector tiles (no key), recoloured to the active theme.
// Pins are our places, numbered pins are roadmap stops, the dotted line is the road shape.
import maplibregl, { type Map as MLMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { Data, Plan } from '../core';
import { startCoord, startName } from '../core';
import type { Tokens } from '../theme/themes';
import { roadShape } from './route';

const STYLE = 'https://tiles.openfreemap.org/styles/positron';

function hex(c: string): [number, number, number] {
  const h = c.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
// Names come from the database (shop names are typed by owners), so they go in as text, never as HTML.
function pinBody(el: HTMLElement, dot: string, label: string) {
  const d = document.createElement('span');
  d.className = 'pin-dot';
  d.textContent = dot;
  const l = document.createElement('span');
  l.className = 'pin-label';
  l.textContent = label;
  el.replaceChildren(d, l);
}

export function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Recolour the base style to the theme. Layer ids are from the OpenFreeMap Positron style. */
export function paintFor(id: string, type: string, k: Tokens): Record<string, string> {
  const water = mix(k.bg, '#4a90c2', 0.35);
  const green = mix(k.bg, '#4f9a62', 0.25);
  if (type === 'background') return { 'background-color': k.bg };
  if (id === 'water') return { 'fill-color': water };
  if (id === 'waterway') return { 'line-color': water };
  if (id === 'park' || id.startsWith('landcover_wood')) return { 'fill-color': green };
  if (id.startsWith('landuse') || id.startsWith('landcover')) return { 'fill-color': mix(k.bg, k.surface2, 0.6) };
  if (id === 'building') return { 'fill-color': mix(k.bg, k.line, 0.6) };
  if (type === 'line' && id.includes('casing')) return { 'line-color': k.line };
  if (type === 'line' && (id.startsWith('highway') || id.startsWith('road'))) return { 'line-color': mix(k.surface, k.bg, 0.2) };
  if (type === 'line' && id.startsWith('railway')) return { 'line-color': mix(k.muted, k.bg, 0.4) };
  if (type === 'line' && id.startsWith('boundary')) return { 'line-color': mix(k.muted, k.bg, 0.5) };
  if (type === 'symbol') return { 'text-color': k.muted, 'text-halo-color': k.bg };
  return {};
}

function recolour(map: MLMap, k: Tokens) {
  for (const l of map.getStyle()?.layers ?? []) {
    if (l.id.startsWith('dishaara-')) continue;
    for (const [prop, val] of Object.entries(paintFor(l.id, l.type, k))) {
      try {
        map.setPaintProperty(l.id, prop, val);
      } catch {
        /* a layer without that property */
      }
    }
  }
  if (map.getLayer('dishaara-route')) map.setPaintProperty('dishaara-route', 'line-color', k.accent);
}

type Props = {
  data: Data;
  plan: Plan | null;
  ids: string[]; // places to show
  stamps: Record<string, unknown>;
  tokens: Tokens;
  lang: 'en' | 'hi';
  me: [number, number] | null;
  onPick: (id: string) => void;
  onRoad: (road: boolean | null) => void;
  shops?: { id: string; kind: string; name: string; coord: [number, number] }[];
  selected?: string | null;
  focus?: [number, number] | null; // [lat, lng] to fly to
};

export function LiveMap({ data, plan, ids, stamps, tokens, lang, me, onPick, onRoad, shops = [], selected = null, focus = null }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const meMarker = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Create the map once.
  useEffect(() => {
    if (!box.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: STYLE,
      center: [data.city.center[1], data.city.center[0]],
      zoom: 13,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => setReady(true));
    // Labels for every pin only when zoomed in; stops are always labelled.
    const labels = () => m.getContainer().classList.toggle('labels-on', m.getZoom() >= 14.6);
    m.on('zoomend', labels);
    m.on('load', labels);
    m.on('error', (e) => {
      if (!m.isStyleLoaded() && String(e.error?.message ?? '').match(/fetch|network|style/i)) setFailed(true);
    });
    map.current = m;
    return () => {
      // A new map (React may mount twice) must wait for its own load event.
      setReady(false);
      m.remove();
      map.current = null;
    };
  }, [data.city.center]);

  // Theme colours.
  useEffect(() => {
    if (ready && map.current) recolour(map.current, tokens);
  }, [ready, tokens]);

  // Pins: places, the start point and (optionally) Bazaar shops. Rebuilt only when what they show changes.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    const stopOf = (id: string) => (plan ? plan.stops.findIndex((s) => s.place.id === id) : -1);
    const add = (el: HTMLElement, lngLat: [number, number], offset: number) =>
      markers.current.push(new maplibregl.Marker({ element: el, anchor: 'left', offset: [offset, 0] }).setLngLat(lngLat).addTo(m));
    for (const id of ids) {
      const p = data.places.find((x) => x.id === id);
      if (!p) continue;
      const [lat, lng] = p.units[0].coord;
      const n = stopOf(id);
      const el = document.createElement('button');
      el.className = `pin${n >= 0 ? ' stop' : ''}${stamps[id] ? ' got' : ''}`;
      el.dataset.pin = id;
      el.setAttribute('aria-label', p.name[lang]);
      pinBody(el, n >= 0 ? String(n + 1) : '', p.name[lang]);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(id);
      });
      add(el, [lng, lat], -14);
    }
    for (const sh of shops) {
      const el = document.createElement('button');
      el.className = `pin shop ${sh.kind}`;
      el.dataset.pin = sh.id;
      el.setAttribute('aria-label', sh.name);
      pinBody(el, '₹', sh.name.replace(/^Sample: |^नमूना: /, ''));
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(sh.id);
      });
      add(el, [sh.coord[1], sh.coord[0]], -11);
    }
    if (plan) {
      // The day's start: a landmark, the raahi's location or their pin.
      const c = startCoord(data, plan.input.startPoint);
      const el = document.createElement('div');
      el.className = 'pin start';
      pinBody(el, '◆', startName(data, plan.input.startPoint)[lang].split(' (')[0]);
      add(el, [c[1], c[0]], -12);
    }
  }, [ready, ids, shops, plan, stamps, lang, data, onPick]);

  // Frame the roadmap when there is one, otherwise the fort area. Only when the plan changes.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || focus) return;
    const bounds = new maplibregl.LngLatBounds();
    const fort = (data.landmarks.find((l) => l.id === 'fort') ?? data.landmarks.find((l) => l.id !== 'station'))?.coord ?? data.city.center;
    for (const p of data.places) {
      const [lat, lng] = p.units[0].coord;
      const inPlan = plan?.stops.some((s) => s.place.id === p.id);
      const nearFort = Math.abs(lat - fort[0]) < 0.02 && Math.abs(lng - fort[1]) < 0.02;
      if (plan?.stops.length ? inPlan : nearFort) bounds.extend([lng, lat]);
    }
    if (!bounds.isEmpty()) m.fitBounds(bounds, { padding: { top: 50, bottom: 40, left: 30, right: 120 }, maxZoom: 15.5, duration: 900 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, plan, data]);

  // Highlight the selected pin.
  useEffect(() => {
    for (const mk of markers.current) mk.getElement().classList.toggle('sel', mk.getElement().dataset.pin === selected);
  }, [selected, ready, ids, shops]);

  // Fly to a place or shop picked from the card strip or another page.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !focus) return;
    m.flyTo({ center: [focus[1], focus[0]], zoom: Math.max(m.getZoom(), 15.5), duration: 900 });
  }, [ready, focus]);

  // Route line.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    let alive = true;
    const clear = () => {
      if (m.getLayer('dishaara-route')) m.removeLayer('dishaara-route');
      if (m.getSource('dishaara-route')) m.removeSource('dishaara-route');
    };
    if (!plan || !plan.stops.length) {
      clear();
      onRoad(null);
      return;
    }
    const home = startCoord(data, plan.input.startPoint);
    const pts: [number, number][] = [home, ...plan.stops.map((s) => s.unit.coord), ...(plan.returnLeg ? [home] : [])];
    roadShape(pts).then(({ coords, road }) => {
      const draw = () => {
        if (!alive || map.current !== m) return;
        try {
          clear();
          m.addSource('dishaara-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
          m.addLayer({
            id: 'dishaara-route',
            type: 'line',
            source: 'dishaara-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': tokens.accent, 'line-width': 4, 'line-dasharray': road ? [1, 0] : [0.5, 2] },
          });
        } catch {
          m.once('idle', draw); // the style is still busy; try again when the map settles
          return;
        }
        onRoad(road);
        const b = new maplibregl.LngLatBounds();
        coords.forEach((c) => b.extend(c));
        if (!focus) m.fitBounds(b, { padding: { top: 50, bottom: 40, left: 40, right: 120 }, maxZoom: 15.5, duration: 900 });
      };
      draw();
    });
    return () => {
      alive = false;
    };
    // tokens.accent is applied by recolour; leaving it out avoids refetching on theme change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, plan, data, onRoad]);

  // Live location dot (only when the raahi allowed location).
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    meMarker.current?.remove();
    meMarker.current = null;
    if (!me) return;
    const el = document.createElement('div');
    el.className = 'me-dot';
    meMarker.current = new maplibregl.Marker({ element: el }).setLngLat([me[1], me[0]]).addTo(m);
  }, [ready, me]);

  if (failed) return <div className="map-failed">Map tiles could not load. Showing the sketch map is the offline option.</div>;
  return <div ref={box} className="live-map" role="region" aria-label="Map" />;
}
