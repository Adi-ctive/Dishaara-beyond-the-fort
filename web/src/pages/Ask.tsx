import { useState } from 'react';
import { useA } from '../store';

export const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

interface Answer { answer: string | null; grounded: boolean; fallback: boolean; tool_results: unknown[] }

// AI assistant panel. Shown only when a backend URL is configured; the key lives on the server.
export default function Ask() {
  const a = useA();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Answer | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setErr(false); setRes(null);
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000); // E7: LLM slower than 15 s → structured view
      const r = await fetch(`${API}/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, lang: a.lang, today: a.today }), signal: ctl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(String(r.status));
      setRes(await r.json());
    } catch { setErr(true); } finally { setBusy(false); }
  };
  return (
    <div className="page">
      <h1>{a.t('askTitle')}</h1>
      <form className="card" onSubmit={(e) => { e.preventDefault(); if (q.trim()) send(); }}>
        <textarea rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder={a.t('askPh')} />
        <button className="btn primary" disabled={busy || !q.trim()}>{a.t('ask')}</button>
      </form>
      {err && <p className="card warn">{a.t('aiDown')}</p>}
      {res && (
        <section className="card">
          {res.answer && !res.fallback ? <><p className="ai-label">{a.t('aiLabel')}</p><p className="ai-text">{res.answer}</p></> : <p className="warn">{a.t('aiFallback')}</p>}
          <details><summary>tool results</summary><pre>{JSON.stringify(res.tool_results, null, 2)}</pre></details>
        </section>
      )}
    </div>
  );
}
