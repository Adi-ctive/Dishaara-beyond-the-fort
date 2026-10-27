// Voice. Reading out: ElevenLabs audio from the backend when it has a key (each text made once),
// otherwise the free browser voice. Listening: the browser's speech recognition where it exists,
// otherwise a short recording sent to the backend (Whisper on Groq).
import { apiBase, apiOn } from './api';
import type { Lang } from './theme/ThemeProvider';

// Same server address as every other call (/api on the live site).
const BASE = apiBase();
let serverVoice: Promise<{ tts: boolean; stt: boolean }> | null = null;
function voiceCaps() {
  if (!apiOn()) return Promise.resolve({ tts: false, stt: false });
  serverVoice ??= fetch(`${BASE}/health`)
    .then((r) => r.json())
    .then((h) => ({ tts: !!h.tts, stt: !!h.stt }))
    .catch(() => ({ tts: false, stt: false }));
  return serverVoice;
}

let current: HTMLAudioElement | null = null;

function browserSpeak(text: string, lang: Lang) {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
  speechSynthesis.speak(u);
}

/** Starts the server check early, so the first tap on a speaker does not wait for it. */
export function warmVoice() {
  voiceCaps();
}

/** Reads text aloud. onState reports 'loading' until the first sound, then 'playing', then 'idle'. */
export function speak(text: string, lang: Lang, onState?: (s: 'loading' | 'playing' | 'idle') => void) {
  stopSpeaking();
  onState?.('loading');
  voiceCaps().then(({ tts }) => {
    if (!tts) {
      onState?.('idle');
      return browserSpeak(text, lang);
    }
    // The server streams the voice, so playback starts with the first chunk.
    const a = new Audio(`${BASE}/tts?${new URLSearchParams({ text, lang })}`);
    a.preload = 'auto';
    current = a;
    a.onplaying = () => onState?.('playing');
    a.onended = () => onState?.('idle');
    a.onerror = () => {
      onState?.('idle');
      browserSpeak(text, lang);
    };
    a.play().catch(() => {
      onState?.('idle');
      browserSpeak(text, lang);
    });
  });
}

export function stopSpeaking() {
  current?.pause();
  current = null;
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

type Rec = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const Recognition = () => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export function canListen(): boolean {
  return !!Recognition() || (apiOn() && typeof MediaRecorder !== 'undefined');
}

/** Starts listening. Returns a stop function. onText gets the words; onEnd always runs. */
export function listen(lang: Lang, onText: (t: string) => void, onEnd: () => void): () => void {
  const C = Recognition();
  if (C) {
    const r = new C();
    r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    r.interimResults = false;
    r.onresult = (e) => onText(e.results[0][0].transcript);
    r.onend = onEnd;
    r.onerror = onEnd;
    r.start();
    return () => r.stop();
  }
  return recordToServer(lang, onText, onEnd);
}

// Up to 8 seconds of audio, sent to /stt. Tapping the mic again stops early.
function recordToServer(lang: Lang, onText: (t: string) => void, onEnd: () => void): () => void {
  let stop = () => {};
  let stream: MediaStream | null = null;
  (async () => {
    const { stt } = await voiceCaps();
    if (!stt || !navigator.mediaDevices?.getUserMedia) return onEnd();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return onEnd();
    }
    const rec = new MediaRecorder(stream);
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    rec.onstop = async () => {
      stream?.getTracks().forEach((t) => t.stop());
      try {
        const form = new FormData();
        form.append('audio', new Blob(parts, { type: rec.mimeType || 'audio/webm' }), 'voice.webm');
        form.append('lang', lang);
        const r = await fetch(`${BASE}/stt`, { method: 'POST', body: form });
        if (r.ok) {
          const { text } = await r.json();
          if (text) onText(text);
        }
      } finally {
        onEnd();
      }
    };
    rec.start();
    const timer = setTimeout(() => rec.state === 'recording' && rec.stop(), 8000);
    stop = () => {
      clearTimeout(timer);
      if (rec.state === 'recording') rec.stop();
    };
  })();
  return () => stop();
}
