'use client';
/* Domains: list, add, edit (id is fixed once created), delete (only when empty). */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/api';
import type { Domain } from '@/lib/data/content';
import { domainErrors, ICON_KEYS, type DomainInput } from '@/lib/questions';

const blank: DomainInput = { id: '', name: '', description: '', iconKey: 'clipboard', accent: '#F7943E', enabled: true, sortOrder: 100 };

export default function DomainsAdmin({ domains }: { domains: Domain[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ mode: 'new' | 'edit'; d: DomainInput } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!editing) return;
    const errs = domainErrors(editing.d);
    if (errs.length) { setMsg({ kind: 'bad', text: errs.join('; ') }); return; }
    setBusy(true); setMsg(null);
    const res = editing.mode === 'new'
      ? await callApi('/api/admin/domains', 'POST', editing.d)
      : await callApi(`/api/admin/domains/${encodeURIComponent(editing.d.id)}`, 'PATCH', editing.d);
    setBusy(false);
    if (res.ok) { setMsg({ kind: 'ok', text: `Saved ${editing.d.name}.` }); setEditing(null); router.refresh(); }
    else setMsg({ kind: 'bad', text: res.data.error ?? 'Could not save.' });
  }

  async function remove(d: Domain) {
    if (!window.confirm(`Delete the domain "${d.name}"?`)) return;
    const res = await callApi(`/api/admin/domains/${encodeURIComponent(d.id)}`, 'DELETE');
    if (res.ok) { setMsg({ kind: 'ok', text: `Deleted ${d.name}.` }); router.refresh(); }
    else setMsg({ kind: 'bad', text: res.data.error ?? 'Could not delete.' });
  }

  const set = <K extends keyof DomainInput>(k: K, v: DomainInput[K]) => setEditing((e) => (e ? { ...e, d: { ...e.d, [k]: v } } : e));

  return (
    <div className="card">
      <div className="spread"><h2>Domains</h2>
        <button className="btn small" onClick={() => { setMsg(null); setEditing({ mode: 'new', d: { ...blank, sortOrder: (domains.at(-1)?.sortOrder ?? 0) + 10 } }); }}>Add domain</button>
      </div>
      {msg && <p className={`notice ${msg.kind}`} role="status">{msg.text}</p>}

      {editing && (
        <div className="stack" style={{ border: '2px solid var(--charcoal)', borderRadius: 12, padding: 14 }}>
          <h3>{editing.mode === 'new' ? 'New domain' : `Edit ${editing.d.name}`}</h3>
          <div className="grid-2 stack">
            <label className="field">Id <span className="opt">(lowercase, fixed once created)</span>
              <input type="text" value={editing.d.id} disabled={editing.mode === 'edit'} onChange={(e) => set('id', e.target.value.toLowerCase())} /></label>
            <label className="field">Name <span className="opt">(max 40)</span>
              <input type="text" value={editing.d.name} onChange={(e) => set('name', e.target.value)} /></label>
          </div>
          <label className="field">Short description <span className="opt">(max 80, shown on the game&rsquo;s domain tile)</span>
            <input type="text" value={editing.d.description} onChange={(e) => set('description', e.target.value)} /></label>
          <div className="grid-2 stack">
            <label className="field">Icon
              <select value={editing.d.iconKey} onChange={(e) => set('iconKey', e.target.value)}>
                {ICON_KEYS.map((k) => <option key={k}>{k}</option>)}
              </select></label>
            <label className="field">Accent colour
              <span className="row" style={{ marginTop: 6 }}>
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(editing.d.accent) ? editing.d.accent : '#F7943E'} onChange={(e) => set('accent', e.target.value.toUpperCase())}
                  style={{ width: 56, height: 52, padding: 2, border: '1.5px solid #C9C9C4', borderRadius: 10 }} />
                <input type="text" value={editing.d.accent} onChange={(e) => set('accent', e.target.value)} style={{ flex: 1 }} />
              </span></label>
          </div>
          <div className="grid-2 stack">
            <label className="field">Order in the game <span className="opt">(lower comes first)</span>
              <input type="text" inputMode="numeric" value={String(editing.d.sortOrder)} onChange={(e) => set('sortOrder', Number(e.target.value.replace(/[^\d-]/g, '')) || 0)} /></label>
            <label className="check" style={{ alignSelf: 'end', paddingBottom: 12 }}>
              <input type="checkbox" checked={editing.d.enabled} onChange={(e) => set('enabled', e.target.checked)} /> <span>Enabled (shown in the game)</span></label>
          </div>
          <div className="row">
            <button className="btn small" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save domain'}</button>
            <button className="btn small ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="scroll-x">
        <table className="tbl">
          <thead><tr><th>Domain</th><th>Id</th><th>Icon</th><th>Questions</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {domains.map((d) => (
              <tr key={d.id}>
                <td><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: d.accent, marginRight: 8 }} />
                  <b>{d.name}</b><br /><span className="small muted">{d.description}</span></td>
                <td className="small">{d.id}</td>
                <td className="small">{d.iconKey}</td>
                <td className="small">{d.enabledQuestionCount} enabled / {d.questionCount}</td>
                <td>{d.enabled ? <span className="pill">enabled</span> : <span className="pill dark">disabled</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="linkbtn small" onClick={() => { setMsg(null); setEditing({ mode: 'edit', d: { id: d.id, name: d.name, description: d.description, iconKey: d.iconKey, accent: d.accent, enabled: d.enabled, sortOrder: d.sortOrder } }); }}>Edit</button>{' '}
                  {d.questionCount === 0 && <button className="linkbtn small" onClick={() => remove(d)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
