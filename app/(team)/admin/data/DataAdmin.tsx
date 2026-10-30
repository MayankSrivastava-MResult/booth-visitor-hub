'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/api';
import type { EventCounts } from '@/lib/data/erase';

const summary = (c: EventCounts) =>
  `${c.visitors} visitor${c.visitors === 1 ? '' : 's'}, ${c.interactions} interaction${c.interactions === 1 ? '' : 's'}, ${c.rounds} game round${c.rounds === 1 ? '' : 's'} (${c.plays} answers)`;

export default function DataAdmin({ counts, initialEmail, purgePhrase }: { counts: EventCounts; initialEmail: string; purgePhrase: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [emailConfirm, setEmailConfirm] = useState('');
  const [phrase, setPhrase] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const b = email.trim().toLowerCase();

  async function erase(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await callApi<EventCounts>(`/api/admin/visitors/${encodeURIComponent(b)}`, 'DELETE', { confirm: emailConfirm });
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: 'ok', text: `Deleted ${b}: ${summary(res.data)}.` });
      setEmail(''); setEmailConfirm(''); router.refresh();
    } else setMsg({ kind: 'bad', text: res.data.error ?? 'Could not delete.' });
  }

  async function purge(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm('Last check: delete ALL visitors, interactions and game rounds? This cannot be undone.')) return;
    setBusy(true); setMsg(null);
    const res = await callApi<EventCounts>('/api/admin/purge', 'POST', { confirm: phrase });
    setBusy(false);
    if (res.ok) { setMsg({ kind: 'ok', text: `Purged: ${summary(res.data)}.` }); setPhrase(''); router.refresh(); }
    else setMsg({ kind: 'bad', text: res.data.error ?? 'Could not purge.' });
  }

  return (
    <>
      {msg && <p className={`notice ${msg.kind}`} role="status">{msg.text}</p>}
      <form className="card" onSubmit={erase}>
        <h2>Delete one visitor</h2>
        <p className="small muted">For a request to delete someone&rsquo;s data. Removes the visitor and everything recorded against
          their email: conversations, podcast, demos, notes and game rounds. Their name may still show on a game screen&rsquo;s
          leaderboard until midnight; remove it there in the game&rsquo;s admin panel.</p>
        <label className="field">Visitor&rsquo;s email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="off" autoComplete="off" spellCheck={false} /></label>
        <label className="field">Type the email again to confirm
          <input type="email" value={emailConfirm} onChange={(e) => setEmailConfirm(e.target.value)} autoCapitalize="off" autoComplete="off" spellCheck={false} /></label>
        <button className="btn danger" type="submit" disabled={busy || !b || emailConfirm.trim().toLowerCase() !== b}>
          {busy ? 'Deleting…' : `Delete ${b || 'visitor'} and all their records`}</button>
      </form>
      <form className="card" onSubmit={purge}>
        <h2>Purge all event data</h2>
        <p className="small muted">Now in the Hub: <b>{summary(counts)}</b>. Purging deletes all of it. Game questions, settings,
          consent texts and team accounts are kept. Use it to clear test data before the event.</p>
        <label className="field">Type <code>{purgePhrase}</code> to confirm
          <input type="text" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoCapitalize="characters" spellCheck={false} autoComplete="off" /></label>
        <button className="btn danger" type="submit" disabled={busy || phrase !== purgePhrase}>{busy ? 'Purging…' : 'Purge all event data'}</button>
      </form>
    </>
  );
}
