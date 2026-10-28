import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEED, runFreshness } from '../core';
import { respondAI, retrieve, systemPrompt, type Ctx } from './ai';

declare const process: { env: Record<string, string | undefined> };

const TODAY = '2026-10-21';
const data = runFreshness(SEED, TODAY).data;
const ctx = (o: Partial<Ctx> = {}): Ctx => ({ data, today: TODAY, lang: 'en', plan: null, added: [], prompt: [], ...o });

// Fake Groq: returns the given replies in order and records what it was sent.
function groqReplies(...texts: string[]) {
  const calls: { messages: { role: string; content: string }[] }[] = [];
  let i = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    calls.push(JSON.parse(init.body));
    const content = texts[Math.min(i++, texts.length - 1)];
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('retrieval agent builds the facts pack', () => {
  it('gives the Jai Vilas advisory but never its disputed prices', () => {
    const { pack } = retrieve('Is Jai Vilas open, what does it cost?', [], ctx());
    const jv = pack.places.find((p) => p.id === 'jai-vilas')!;
    const fees = jv.sections[0].fees as { value?: string; advisory?: string; rows?: unknown };
    expect(fees.value).toMatch(/not confirmed/);
    expect(fees.advisory).toMatch(/verify these details with the venue/);
    expect(fees.rows).toBeUndefined();
    expect(JSON.stringify(jv)).not.toMatch(/350|550|1000/);
    expect(jv.sections[0].todaysVerdict).toBe('confirm with the place before going');
  });
  it('the system prompt carries the raahi lines and the no-memory rule', () => {
    const p = systemPrompt(ctx({ prompt: ['Likes forts', 'Max 1 hour per place'] }));
    expect(p).toMatch(/Likes forts; Max 1 hour per place/);
    expect(p).toMatch(/Never use your own memory/);
  });
});

describe('AI reply guards', () => {
  it('a grounded reply is shown as AI', async () => {
    const calls = groqReplies('The fort ticket is ₹25 in cash, officially confirmed on 13 Oct.');
    const r = await respondAI('Fort ticket price?', [], ctx(), 'test-key');
    expect(r.ai).toBe(true);
    expect(r.text).toMatch(/₹25/);
    expect(r.cards.length).toBeGreaterThan(0); // cards still come from code
    expect(calls[0].messages[1].content).toMatch(/^FACTS: /); // the model only sees the pack
  });

  it('an invented fee is rewritten once, then the plain answer is used', async () => {
    const calls = groqReplies('The fort ticket is ₹75.', 'Still ₹75, trust me.');
    const r = await respondAI('Fort ticket price?', [], ctx(), 'test-key');
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)!.content).toMatch(/values not in FACTS: ₹75/);
    expect(r.ai).toBe(false);
    expect(r.note).toBe('grounding');
    expect(r.text).toMatch(/\*\*Gwalior Fort: .*\n- \*\*Hours/);
  });

  it('naming a place the raahi did not ask about is caught and fixed', async () => {
    groqReplies('Teli ka Mandir is good today, and the Tomb of Tansen is lovely too.', 'Teli ka Mandir is good to go today.');
    const r = await respondAI('Can I go to Teli ka Mandir today?', [], ctx(), 'test-key');
    expect(r.ai).toBe(true);
    expect(r.text).not.toMatch(/Tansen/);
  });

  it('a network failure falls back without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const r = await respondAI('Fort ticket price?', [], ctx(), 'test-key');
    expect(r.ai).toBe(false);
    expect(r.note).toBe('error');
  });

  it('emergencies never wait for the model', async () => {
    const calls = groqReplies('anything');
    const r = await respondAI('I need an ambulance', [], ctx(), 'test-key');
    expect(calls).toHaveLength(0);
    expect(r.cards[0].kind).toBe('sos');
  });
});

// Live check against Groq. Runs only when GROQ_KEY is set in the shell. The key is never written to a file.
describe.skipIf(!process.env.GROQ_KEY)('Groq live', () => {
  it('answers about Jai Vilas from the pack and passes the guards', async () => {
    const r = await respondAI('Is Jai Vilas Palace open today and what does it cost?', [], ctx(), process.env.GROQ_KEY!);
    expect(r.note).toBeUndefined();
    expect(r.ai).toBe(true);
  }, 40000);
});

describe('local chat picks the right place and city', () => {
  it('teli ka mandir is Teli ka Mandir, not the fort by typo', async () => {
    const { respond } = await import('./local');
    expect(respond('teli ka mandir', data, TODAY, 'en').cards[0]).toEqual({ kind: 'place', id: 'teli-ka-mandir' });
  });
  it('another city is not covered', async () => {
    const { respond } = await import('./local');
    const r = respond('agra fort timings', data, TODAY, 'en');
    expect(r.text).toMatch(/Agra is not covered yet/);
    expect(r.cards).toHaveLength(0);
  });
  it('hours in the question reach the planner', async () => {
    const { respond } = await import('./local');
    expect(respond('plan my day 5 hours', data, TODAY, 'en').cards[0]).toEqual({ kind: 'quick', hours: 5 });
  });
});
