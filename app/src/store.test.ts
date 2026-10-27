import { describe, expect, it } from 'vitest';
import { award, type State } from './store';

const base = { points: 0, awarded: [] as string[] } as unknown as State;

describe('points belong to an account', () => {
  it('a guest earns nothing', () => {
    expect(award({ ...base, signedIn: false }, 'tick:x', 10)).toEqual({});
  });
  it('a signed-in raahi earns once per key', () => {
    const first = award({ ...base, signedIn: true }, 'tick:x', 10);
    expect(first).toEqual({ points: 10, awarded: ['tick:x'] });
    expect(award({ ...base, signedIn: true, points: 10, awarded: ['tick:x'] }, 'tick:x', 10)).toEqual({});
  });
});
