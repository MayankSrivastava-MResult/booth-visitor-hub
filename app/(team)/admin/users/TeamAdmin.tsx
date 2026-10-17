'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/api';
import type { TeamMember } from '@/lib/data/team';

export default function TeamAdmin({ team, meId }: { team: TeamMember[]; meId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', displayName: '', role: 'staff' as 'staff' | 'admin', password: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null); setFields({});
    const res = await callApi('/api/admin/users', 'POST', form);
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: 'ok', text: `Added ${form.displayName}. Give them their email and password; they sign in at this site’s /login page.` });
      setForm({ email: '', displayName: '', role: 'staff', password: '' });
      router.refresh();
    } else { setFields(res.data.fields ?? {}); setMsg({ kind: 'bad', text: res.data.error ?? 'Could not add.' }); }
  }

  async function patch(id: string, body: Record<string, unknown>, done: string) {
    setMsg(null);
    const res = await callApi(`/api/admin/users/${id}`, 'PATCH', body);
    if (res.ok) { setMsg({ kind: 'ok', text: done }); router.refresh(); }
    else setMsg({ kind: 'bad', text: res.data.fields ? Object.values(res.data.fields)[0] : res.data.error ?? 'Could not save.' });
  }

  function resetPassword(m: TeamMember, restore = false) {
    const pw = window.prompt(`New password for ${m.displayName} (at least 10 characters):`);
    if (!pw) return;
    if (restore) patch(m.id, { password: pw, active: true }, `${m.displayName} restored with the new password.`);
    else patch(m.id, { password: pw }, `Password reset for ${m.displayName}. They have been signed out.`);
  }

  const err = (k: string) => (fields[k] ? <span className="err">{fields[k]}</span> : null);

  return (
    <>
      {msg && <p className={`notice ${msg.kind}`} role="status">{msg.text}</p>}
      <div className="card">
        <h2>People</h2>
        <div className="list">
          {team.map((m) => (
            <div key={m.id} className="spread">
              <span className="stack" style={{ gap: 0 }}>
                <span className="item-title">{m.displayName} {!m.active && <span className="pill">removed</span>} {m.role === 'admin' && <span className="pill dark">admin</span>}</span>
                <span className="small muted">{m.email}</span>
              </span>
              {m.id === meId ? <span className="small muted">You</span> : (
                <span className="row">
                  {m.active ? <>
                    <button className="btn small ghost" onClick={() => patch(m.id, { role: m.role === 'admin' ? 'staff' : 'admin' }, `${m.displayName} is now ${m.role === 'admin' ? 'staff' : 'an admin'}.`)}>
                      Make {m.role === 'admin' ? 'staff' : 'admin'}</button>
                    <button className="btn small ghost" onClick={() => resetPassword(m)}>Reset password</button>
                    <button className="btn small ghost" onClick={() => window.confirm(`Remove ${m.displayName}? They will be signed out at once.`) && patch(m.id, { active: false }, `${m.displayName} removed.`)}>Remove</button>
                  </> : <button className="btn small ghost" onClick={() => resetPassword(m, true)}>Restore with new password</button>}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <form className="card" onSubmit={add} noValidate>
        <h2>Add a person</h2>
        <label className="field">Email
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoCapitalize="off" />{err('email')}</label>
        <label className="field">Name
          <input type="text" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />{err('displayName')}</label>
        <label className="field">Role
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'staff' | 'admin' })}>
            <option value="staff">Staff</option><option value="admin">Admin</option></select></label>
        <label className="field">Password <span className="opt">(at least 10 characters; you give it to them)</span>
          <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" autoCapitalize="off" spellCheck={false} />{err('password')}</label>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add person'}</button>
      </form>
    </>
  );
}
