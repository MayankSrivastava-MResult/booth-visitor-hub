'use client';
/* Pre-seed visitors from the organisers' list (CSV or Excel). Name and company are
 * required; people already in the Hub are skipped. They show as "pre-seeded" until a
 * team member completes their registration (consent) in person. */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/api';

type Result = { added: number; alreadyThere: number; skipped: { row: number; reasons: string[] }[]; cleared: { row: number; fields: string[] }[] };

const MAX_BYTES = 3 * 1024 * 1024;

function base64(buf: ArrayBuffer) {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export default function ImportVisitors() {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setMsg(''); setResult(null);
    if (file.size > MAX_BYTES) { setMsg('That file is too large (max 3 MB).'); return; }
    setBusy(true);
    const isXlsx = /\.xlsx$/i.test(file.name);
    const res = await callApi<Result>('/api/admin/import', 'POST',
      isXlsx ? { xlsx: base64(await file.arrayBuffer()) } : { csv: await file.text() });
    setBusy(false);
    if (res.ok) { setResult(res.data); router.refresh(); } else setMsg(res.data.error ?? 'Import failed.');
  }

  return (
    <div className="card">
      <h2>Import the organisers&rsquo; list</h2>
      <p className="small muted">An Excel (.xlsx) or CSV file with a header row. Columns are matched by name:
        <b> Full name</b> (or First name and Last name) and <b>Company</b> are required; Job title, Email, Mobile and LinkedIn are
        used if present. People already in the Hub are skipped, so the same file can be imported again.
        Imported people show as <i>pre-seeded</i>: staff find them by name in Log interaction, and complete their registration
        (consent) when they visit.</p>
      <label className="btn small" style={{ cursor: busy ? 'default' : 'pointer', alignSelf: 'flex-start' }}>
        {busy ? 'Importing…' : 'Import a file'}
        <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden disabled={busy}
          onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {msg && <p className="notice bad" role="alert">{msg}</p>}
      {result && (
        <div className="stack">
          <p className={`notice ${result.skipped.length ? 'info' : 'ok'}`} role="status">
            Added {result.added}. Already in the Hub: {result.alreadyThere}. Skipped: {result.skipped.length}.</p>
          {result.cleared.length > 0 && <p className="small muted">Left out because they were not valid: {result.cleared
            .map((c) => `row ${c.row} (${c.fields.join(', ')})`).join('; ')}.</p>}
          {result.skipped.length > 0 && (
            <div className="scroll-x"><table className="tbl">
              <thead><tr><th>Row</th><th>Why it was skipped</th></tr></thead>
              <tbody>{result.skipped.map((s) => <tr key={s.row}><td>{s.row}</td><td>{s.reasons.join('; ')}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}
