// Road shape for the roadmap, from the public OSRM demo router (OpenStreetMap data, no key).
// Only the line on the map comes from here. Times and fares stay our own estimates.
// If the router is slow or down, straight lines are used and the map says so.

export type LngLat = [number, number];
export type RouteShape = { coords: LngLat[]; road: boolean };

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const CACHE = 'dishaara.routes.v1';
const TIMEOUT_MS = 6000;

function cacheGet(key: string): LngLat[] | null {
  try {
    return (JSON.parse(localStorage.getItem(CACHE) ?? '{}') as Record<string, LngLat[]>)[key] ?? null;
  } catch {
    return null;
  }
}
function cachePut(key: string, coords: LngLat[]) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE) ?? '{}') as Record<string, LngLat[]>;
    all[key] = coords;
    const keys = Object.keys(all);
    if (keys.length > 20) delete all[keys[0]]; // keep the cache small
    localStorage.setItem(CACHE, JSON.stringify(all));
  } catch {
    /* storage blocked: no offline route */
  }
}

/** points are [lat, lng] as stored in our data. */
export async function roadShape(points: [number, number][]): Promise<RouteShape> {
  const ll: LngLat[] = points.map(([lat, lng]) => [lng, lat]);
  if (ll.length < 2) return { coords: ll, road: false };
  const key = ll.map((p) => p.map((x) => x.toFixed(4)).join(',')).join(';');
  const hit = cacheGet(key);
  if (hit) return { coords: hit, road: true };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${OSRM}${key}?overview=full&geometries=geojson`, { signal: ctl.signal });
    if (!r.ok) throw new Error(`OSRM ${r.status}`);
    const j = await r.json();
    const coords = j?.routes?.[0]?.geometry?.coordinates as LngLat[] | undefined;
    if (j.code !== 'Ok' || !coords?.length) throw new Error('no route');
    cachePut(key, coords);
    return { coords, road: true };
  } catch {
    return { coords: ll, road: false };
  } finally {
    clearTimeout(timer);
  }
}
