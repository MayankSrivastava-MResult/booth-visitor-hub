'use client';
/* Admin-only: edit a visitor's details. The badge ID and consent cannot be changed here. */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/api';

type V = { badgeId: string; fullName: string; company: string; jobTitle: string; email: string; mobile: string; linkedinUrl: string; marketingOptIn: boolean };

export default function EditVisitor({ visitor }: { visitor: V }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(visitor);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(''); setFields({});
    const { badgeId, ...body } = v;
    const res = await callApi(`/api/admin/visitors/${encodeURIComponent(badgeId)}`, 'PATCH', body);
    setBusy(false);
    if (res.ok) { setOpen(false); router.refresh(); return; }
    setFields(res.data.fields ?? {});
    setMsg(res.data.error ?? 'Could not save.');
  }

  if (!open) return <div><button className="btn small ghost" onClick={() => setOpen(true)}>Edit details</button></div>;

  const text = (k: 'fullName' | 'company' | 'jobTitle' | 'email' | 'mobile' | 'linkedinUrl', label: string, type = 'text') => (
    <label className="field">{label}
      <input type={type} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-invalid={!!fields[k]} />
      {fields[k] && <span className="err">{fields[k]}</span>}
    </label>
  );

  return (
    <form className="stack" onSubmit={save} noValidate>
      {text('fullName', 'Full name')}{text('company', 'Company')}{text('jobTitle', 'Job title')}
      {text('email', 'Email', 'email')}{text('mobile', 'Mobile', 'tel')}{text('linkedinUrl', 'LinkedIn', 'url')}
      <label className="check"><input type="checkbox" checked={v.marketingOptIn} onChange={(e) => setV({ ...v, marketingOptIn: e.target.checked })} />
        <span>Agreed to marketing communications</span></label>
      {msg && <p className="notice bad">{msg}</p>}
      <div className="row">
        <button className="btn small" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="btn small ghost" type="button" onClick={() => { setV(visitor); setOpen(false); }}>Cancel</button>
      </div>
    </form>
  );
}
