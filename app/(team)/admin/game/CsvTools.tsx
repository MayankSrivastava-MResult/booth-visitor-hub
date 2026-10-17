'use client';
/* CSV import/export of the question bank (locked layout) and the
 * "delete all TEST questions" bulk action (typed confirmation). */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/api';
import { CSV_HEADER } from '@/lib/questions';

type ImportResult = { created: number; updated: number; skipped: { row: number; id: string; reasons: string[] }[] };

export default function CsvTools({ testCount }: { testCount: number }) {
  const router = useRouter();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState('');

  async function importFile(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMsg(null); setResult(null);
    const res = await callApi<ImportResult>('/api/admin/questions/import', 'POST', { csv: await file.text() });
    setBusy(false);
    if (res.ok) { setResult(res.data); router.refresh(); } else setMsg({ kind: 'bad', text: res.data.error ?? 'Import failed.' });
  }

  async function deleteTest() {
    setBusy(true); setMsg(null);
    const res = await callApi<{ deleted: number }>('/api/admin/questions/delete-test', 'POST', { confirm });
    setBusy(false); setConfirm('');
    if (res.ok) { setMsg({ kind: 'ok', text: `Deleted ${res.data.deleted} TEST questions.` }); router.refresh(); }
    else setMsg({ kind: 'bad', text: res.data.error ?? 'Could not delete.' });
  }

  return (
    <div className="card">
      <h2>CSV import and export</h2>
      <p className="small muted">One row per question with exactly these columns: <code>{CSV_HEADER.join(', ')}</code>.
        Leave option5 empty for 4-option questions. correctOption is the option number (1–5). enabled is yes or no.
        Rows that break a rule are listed and skipped; an existing id is updated.</p>
      <div className="row">
        <a className="btn small ghost" href="/api/admin/questions/export">Export all questions (.csv)</a>
        <label className="btn small" style={{ cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Working…' : 'Import a CSV file'}
          <input type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      {result && (
        <div className="stack">
          <p className={`notice ${result.skipped.length ? 'info' : 'ok'}`} role="status">
            Imported: {result.created} new, {result.updated} updated. Skipped: {result.skipped.length}.</p>
          {result.skipped.length > 0 && (
            <div className="scroll-x"><table className="tbl">
              <thead><tr><th>Row</th><th>Id</th><th>Why it was skipped</th></tr></thead>
              <tbody>{result.skipped.map((s) => <tr key={s.row}><td>{s.row}</td><td>{s.id || '—'}</td><td>{s.reasons.join('; ')}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      )}

      <h2 style={{ marginTop: 8 }}>Delete TEST questions</h2>
      <p className="small muted">Deletes every question whose source starts with &ldquo;TEST&rdquo; ({testCount} now). Do this once the real
        questions are imported. Game devices keep their current questions until the Hub has at least one playable domain.</p>
      <div className="row">
        <input type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type TEST to confirm" style={{ width: 220 }} autoCapitalize="characters" />
        <button className="btn small danger" disabled={confirm !== 'TEST' || busy || testCount === 0} onClick={deleteTest}>Delete {testCount} TEST questions</button>
      </div>
      {msg && <p className={`notice ${msg.kind}`} role="status">{msg.text}</p>}
    </div>
  );
}
