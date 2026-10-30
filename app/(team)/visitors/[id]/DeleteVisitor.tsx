'use client';
/* Admin-only: right-to-erasure for this visitor. Removes them and everything recorded
 * against them (interactions, game rounds under their email). Typed confirmation. */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/api';

export default function DeleteVisitor({ id, fullName }: { id: string; fullName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const same = confirm.trim().replace(/\s+/g, ' ').toLowerCase() === fullName.trim().replace(/\s+/g, ' ').toLowerCase();

  async function erase(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const res = await callApi(`/api/admin/visitors/${id}`, 'DELETE', { confirm });
    setBusy(false);
    if (res.ok) { router.replace('/visitors'); router.refresh(); return; }
    setMsg(res.data.error ?? 'Could not delete.');
  }

  if (!open) return <p className="small"><button type="button" className="linkbtn" onClick={() => setOpen(true)}>Delete this visitor and all their records…</button></p>;
  return (
    <form className="stack" onSubmit={erase} noValidate>
      <p className="small muted">For a request to delete someone&rsquo;s data. Removes the visitor and everything recorded against them:
        conversations, podcast, demos, notes and game rounds played under their email. Their name may still show on a game
        screen&rsquo;s leaderboard until midnight; remove it there in the game&rsquo;s admin panel.</p>
      <label className="field">Type their full name to confirm
        <input type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} /></label>
      {msg && <p className="notice bad">{msg}</p>}
      <div className="row">
        <button className="btn small danger" type="submit" disabled={busy || !same}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
        <button className="btn small ghost" type="button" onClick={() => { setOpen(false); setConfirm(''); }}>Cancel</button>
      </div>
    </form>
  );
}
