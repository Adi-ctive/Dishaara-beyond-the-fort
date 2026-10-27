import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('api client', () => {
  it('without VITE_API_URL every call is null and nothing is fetched', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { api, apiOn } = await import('./api');
    expect(apiOn()).toBe(false);
    expect(await api.getTwists()).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('with a backend it sends JSON and the sign-in token', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8010/');
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] });
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return { ok: true, json: async () => (url.endsWith('/auth/google') ? { token: 'abc', user: { id: 'u1', name: 'Aditya', roles: ['raahi'] } } : { status: 'confirmed' }) };
    }));
    const { api } = await import('./api');
    await api.signInDemo('Aditya');
    await api.stamp({ placeId: 'sas-bahu', readings: [] });
    expect(calls[1][0]).toBe('http://localhost:8010/stamps');
    expect((calls[1][1].headers as Record<string, string>).Authorization).toBe('Bearer abc');
  });

  it('a server error returns null instead of throwing', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8010');
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    const { api } = await import('./api');
    expect(await api.chat({ text: 'x', history: [], lang: 'en', prompt: [] })).toBeNull();
  });
});
