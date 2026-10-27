import { afterEach, describe, expect, it, vi } from 'vitest';
import { roadShape } from './route';
import { mix, paintFor } from './LiveMap';
import { THEMES } from '../theme/themes';

afterEach(() => vi.unstubAllGlobals());

describe('road shape', () => {
  it('uses the router line when it answers', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry: { coordinates: [[78.1, 26.2], [78.15, 26.21], [78.2, 26.22]] } }] }) })));
    const r = await roadShape([[26.2, 78.1], [26.22, 78.2]]);
    expect(r.road).toBe(true);
    expect(r.coords).toHaveLength(3);
  });
  it('falls back to straight lines when the router fails', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const r = await roadShape([[26.2, 78.1], [26.22, 78.2]]);
    expect(r.road).toBe(false);
    expect(r.coords).toEqual([[78.1, 26.2], [78.2, 26.22]]); // lng, lat order for the map
  });
});

describe('map colours follow the theme', () => {
  it('background and labels use the theme tokens', () => {
    const k = THEMES[0].light;
    expect(paintFor('background', 'background', k)['background-color']).toBe(k.bg);
    expect(paintFor('label_city', 'symbol', k)['text-halo-color']).toBe(k.bg);
  });
  it('mix blends two colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
