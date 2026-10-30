'use client';
/* Meeting minutes editor: bold, italic, underline, numbered and bulleted lists, and a
 * mic button that transcribes speech (the browser's own speech recognition) and adds
 * each finished phrase as a new line at the end. Pasted text arrives without its
 * formatting. The server keeps only these simple tags (lib/rich-text.ts). */
import { useEffect, useRef, useState } from 'react';

type Props = {
  /** Starting content (formatted text). Changing `resetKey` loads `value` again. */
  value: string;
  resetKey?: string | number;
  onChange: (html: string) => void;
  label: string;
};

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;

const TOOLS = [
  { cmd: 'bold', label: 'B', title: 'Bold', style: { fontWeight: 800 } },
  { cmd: 'italic', label: 'I', title: 'Italic', style: { fontStyle: 'italic' } },
  { cmd: 'underline', label: 'U', title: 'Underline', style: { textDecoration: 'underline' } },
  { cmd: 'insertOrderedList', label: '1.', title: 'Numbered list', style: {} },
  { cmd: 'insertUnorderedList', label: '•', title: 'Bulleted list', style: { fontSize: 20 } },
] as const;

const speechApi = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export default function RichTextEditor({ value, resetKey, onChange, label }: Props) {
  const ed = useRef<HTMLDivElement>(null);
  const rec = useRef<Recognition | null>(null);
  const wantMic = useRef(false);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [canMic, setCanMic] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [micErr, setMicErr] = useState('');

  useEffect(() => { setCanMic(!!speechApi()); }, []);
  useEffect(() => {
    if (ed.current) ed.current.innerHTML = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  useEffect(() => () => { wantMic.current = false; rec.current?.stop(); }, []);

  const changed = () => onChange(ed.current?.innerHTML ?? '');
  const refreshActive = () => {
    const a: Record<string, boolean> = {};
    for (const t of TOOLS) { try { a[t.cmd] = document.queryCommandState(t.cmd); } catch { a[t.cmd] = false; } }
    setActive(a);
  };

  function run(cmd: string) {
    ed.current?.focus();
    document.execCommand(cmd);
    refreshActive(); changed();
  }

  /** A finished phrase from the mic: a new line at the end of the minutes. */
  function addLine(text: string) {
    const el = ed.current; const t = text.trim();
    if (!el || !t) return;
    const line = document.createElement('div');
    line.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    if (!el.textContent?.trim()) el.innerHTML = '';
    el.appendChild(line);
    changed();
  }

  function toggleMic() {
    if (listening) { wantMic.current = false; rec.current?.stop(); return; }
    const Ctor = speechApi();
    if (!Ctor) return;
    setMicErr('');
    const r = new Ctor();
    r.lang = 'en-IN'; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) addLine(res[0].transcript); else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantMic.current = false;
        setMicErr('The microphone is blocked. Allow it for this site in the browser settings.');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') setMicErr('Transcription stopped. Tap the mic to start again.');
    };
    // Browsers stop listening after a pause; carry on until the mic is tapped off.
    r.onend = () => {
      setInterim('');
      if (wantMic.current) { try { r.start(); return; } catch { /* fall through */ } }
      setListening(false);
    };
    rec.current = r; wantMic.current = true;
    try { r.start(); setListening(true); } catch { setMicErr('Could not start the microphone.'); }
  }

  return (
    <div className="rte">
      <div className="rte-bar" role="toolbar" aria-label={`${label} formatting`}>
        {TOOLS.map((t) => (
          <button type="button" key={t.cmd} title={t.title} aria-label={t.title} aria-pressed={!!active[t.cmd]}
            className={active[t.cmd] ? 'on' : ''} style={t.style}
            onMouseDown={(e) => e.preventDefault()} onClick={() => run(t.cmd)}>{t.label}</button>
        ))}
        {canMic && (
          <button type="button" className={`rte-mic${listening ? ' live' : ''}`} onClick={toggleMic}
            title={listening ? 'Stop transcribing' : 'Transcribe speech into the minutes'} aria-pressed={listening}
            aria-label={listening ? 'Stop transcribing' : 'Start transcribing'}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            {listening ? 'Stop' : 'Dictate'}
          </button>
        )}
      </div>
      <div ref={ed} className="rte-area" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label}
        onInput={() => { changed(); refreshActive(); }} onKeyUp={refreshActive} onMouseUp={refreshActive} onFocus={refreshActive}
        onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }} />
      {listening && <p className="hint" aria-live="polite">Listening… {interim && <i>{interim}</i>}</p>}
      {micErr && <p className="err">{micErr}</p>}
    </div>
  );
}
