'use client';
/* Edit / delete buttons under a timeline entry (shown only to its creator or an admin). */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/api';
import InteractionForm, { type InteractionValues, type Lists, type TeamOption } from '@/components/InteractionForm';

type Props = {
  id: string; values: InteractionValues; me: TeamOption; team: TeamOption[]; lists: Lists;
  who: { badgeId: string; fullName: string; company: string; jobTitle: string };
};

export default function InteractionActions({ id, values, me, team, lists, who }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');

  async function remove() {
    if (!window.confirm('Delete this entry? This cannot be undone.')) return;
    const res = await callApi(`/api/interactions/${id}`, 'DELETE');
    if (res.ok) router.refresh(); else setErr(res.data.error ?? 'Could not delete.');
  }

  if (editing) {
    return (
      <div className="stack" style={{ marginTop: 8 }}>
        <InteractionForm me={me} team={team} lists={lists} existing={{ id, values, who }}
          onSaved={() => { setEditing(false); router.refresh(); }} />
        <button type="button" className="btn small ghost" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    );
  }
  return (
    <div className="row">
      <button type="button" className="linkbtn small" onClick={() => setEditing(true)}>Edit</button>
      <button type="button" className="linkbtn small" onClick={remove}>Delete</button>
      {err && <span className="err">{err}</span>}
    </div>
  );
}
