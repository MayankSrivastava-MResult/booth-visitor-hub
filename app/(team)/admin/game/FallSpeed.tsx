'use client';
/* Pill fall speed for every game screen (a factor on the game's built-in fall times).
 * Shows how long a pill takes to cross the play zone at the start and end of a round. */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/api';

const START_S = 6.0, END_S = 3.2;   // the game's built-in fall times (pharma-ninja-src/src/app.js DEFAULT_SETTINGS)
const label = (f: number) => (f < 0.95 ? 'Slower' : f > 1.05 ? 'Faster' : 'Normal');

export default function FallSpeed({ initial }: { initial: number }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setMsg(null);
    const res = await callApi<{ fallSpeed: number }>('/api/admin/game-settings', 'PUT', { fallSpeed: v });
    setBusy(false);
    if (res.ok) {
      setSaved(res.data.fallSpeed);
      setMsg({ kind: 'ok', text: 'Saved. Game screens pick it up within 5 minutes, or at once with “Refresh content now” in the game’s admin panel.' });
      router.refresh();
    } else setMsg({ kind: 'bad', text: res.data.error ?? 'Could not save.' });
  }

  return (
    <div className="card">
      <h2>Pill fall speed</h2>
      <label className="field">
        <span className="spread"><span>{label(v)} · {Math.round(v * 100)}%</span>
          <span className="small muted">a pill takes {(START_S / v).toFixed(1)} s to fall at the start of a round, {(END_S / v).toFixed(1)} s at the end</span></span>
        <input type="range" min={0.5} max={2} step={0.05} value={v} onChange={(e) => { setV(Number(e.target.value)); setMsg(null); }}
          aria-valuetext={`${Math.round(v * 100)}%`} style={{ width: '100%', accentColor: 'var(--orange)' }} />
        <span className="spread small muted"><span>50% (slowest)</span><span>200% (fastest)</span></span>
      </label>
      <p className="small muted">Slow it down if long answers are hard to read; speed it up if rounds feel easy.</p>
      {msg && <p className={`notice ${msg.kind}`} role="status">{msg.text}</p>}
      <div className="row">
        <button className="btn small" type="button" disabled={busy || v === saved} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        {v !== 1 && <button className="btn small ghost" type="button" onClick={() => { setV(1); setMsg(null); }}>Reset to 100%</button>}
      </div>
    </div>
  );
}
