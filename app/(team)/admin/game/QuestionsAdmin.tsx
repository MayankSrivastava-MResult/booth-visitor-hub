'use client';
/* Questions: filter by domain, add, edit, delete. The editor shows the game's
 * rules live (characters and words per option, question length). */
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { callApi } from '@/components/api';
import { questionErrors, type QuestionInput } from '@/lib/questions';

type D = { id: string; name: string; accent: string };

export default function QuestionsAdmin({ domains, questions }: { domains: D[]; questions: QuestionInput[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState(domains[0]?.id ?? '');
  const [editing, setEditing] = useState<{ mode: 'new' | 'edit'; q: QuestionInput } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = useMemo(() => new Set(domains.map((d) => d.id)), [domains]);
  const shown = questions.filter((q) => !filter || q.domainId === filter);

  function startNew() {
    setMsg(null);
    setEditing({ mode: 'new', q: { id: '', domainId: filter || domains[0]?.id || '', questionText: '', options: ['', '', '', ''], correctIndex: 0,
      difficulty: 1, explanation: '', source: '', enabled: true } });
  }

  async function save() {
    if (!editing) return;
    const q = { ...editing.q, options: editing.q.options.map((o) => o.trim()).filter((o, i) => i < 4 || o !== '') };
    const errs = questionErrors(q, ids);
    if (errs.length) { setMsg({ kind: 'bad', text: errs.join('; ') }); return; }
    setBusy(true); setMsg(null);
    const res = editing.mode === 'new'
      ? await callApi('/api/admin/questions', 'POST', q)
      : await callApi(`/api/admin/questions/${encodeURIComponent(q.id)}`, 'PATCH', q);
    setBusy(false);
    if (res.ok) { setMsg({ kind: 'ok', text: `Saved ${q.id}.` }); setEditing(null); router.refresh(); }
    else setMsg({ kind: 'bad', text: res.data.error ?? 'Could not save.' });
  }

  async function remove(q: QuestionInput) {
    if (!window.confirm(`Delete question ${q.id}?`)) return;
    const res = await callApi(`/api/admin/questions/${encodeURIComponent(q.id)}`, 'DELETE');
    if (res.ok) { setMsg({ kind: 'ok', text: `Deleted ${q.id}.` }); router.refresh(); } else setMsg({ kind: 'bad', text: res.data.error ?? 'Could not delete.' });
  }

  const setQ = <K extends keyof QuestionInput>(k: K, v: QuestionInput[K]) => setEditing((e) => (e ? { ...e, q: { ...e.q, [k]: v } } : e));
  const setOpt = (i: number, v: string) => setEditing((e) => {
    if (!e) return e;
    const options = [...e.q.options]; options[i] = v;
    return { ...e, q: { ...e.q, options } };
  });

  const q = editing?.q;
  const liveErrs = q ? questionErrors({ ...q, options: q.options.map((o) => o.trim()).filter((o, i) => i < 4 || o !== '') }, ids)
    .filter((e) => !(editing?.mode === 'new' && q.id === '' && e.startsWith('id'))) : [];

  return (
    <div className="card">
      <div className="spread">
        <h2>Questions</h2>
        <div className="row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }} aria-label="Domain">
            <option value="">All domains</option>
            {domains.map((d) => <option key={d.id} value={d.id}>{d.name} ({questions.filter((x) => x.domainId === d.id).length})</option>)}
          </select>
          <button className="btn small" onClick={startNew} disabled={!domains.length}>Add question</button>
        </div>
      </div>
      {msg && <p className={`notice ${msg.kind}`} role="status">{msg.text}</p>}

      {editing && q && (
        <div className="stack" style={{ border: '2px solid var(--charcoal)', borderRadius: 12, padding: 14 }}>
          <h3>{editing.mode === 'new' ? 'New question' : `Edit ${q.id}`}</h3>
          <div className="grid-2 stack">
            <label className="field">Id <span className="opt">(fixed once created, e.g. qc-06)</span>
              <input type="text" value={q.id} disabled={editing.mode === 'edit'} onChange={(e) => setQ('id', e.target.value.trim())} /></label>
            <label className="field">Domain
              <select value={q.domainId} onChange={(e) => setQ('domainId', e.target.value)}>
                {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select></label>
          </div>
          <label className="field">Question <span className="opt">({q.questionText.length}/120)</span>
            <textarea rows={2} value={q.questionText} onChange={(e) => setQ('questionText', e.target.value)} aria-invalid={q.questionText.length > 120} /></label>
          <div className="field"><span>Options <span className="opt">(4 or 5; each max 4 words and 28 characters; tick the correct one)</span></span>
            <div className="stack">
              {[0, 1, 2, 3, 4].map((i) => {
                const o = q.options[i] ?? '';
                const words = o.trim() ? o.trim().split(/\s+/).length : 0;
                const bad = o.length > 28 || words > 4;
                return (
                  <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
                    <input type="radio" name="correct" checked={q.correctIndex === i} onChange={() => setQ('correctIndex', i)}
                      aria-label={`Option ${i + 1} is correct`} style={{ width: 24, height: 24, flexShrink: 0, accentColor: 'var(--charcoal)' }} />
                    <input type="text" value={o} placeholder={i === 4 ? 'Option 5 (optional)' : `Option ${i + 1}`} aria-invalid={bad}
                      onChange={(e) => setOpt(i, e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                    <span className={`small ${bad ? 'err' : 'muted'}`} style={{ width: 70, textAlign: 'right', flexShrink: 0 }}>{o.length}/28 · {words}w</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid-2 stack">
            <label className="field">Difficulty
              <div className="seg">{[1, 2, 3].map((n) => <button type="button" key={n} className={q.difficulty === n ? 'on' : ''} onClick={() => setQ('difficulty', n)}>{n}</button>)}</div></label>
            <label className="check" style={{ alignSelf: 'end', paddingBottom: 12 }}>
              <input type="checkbox" checked={q.enabled} onChange={(e) => setQ('enabled', e.target.checked)} /> <span>Enabled</span></label>
          </div>
          <label className="field">Explanation <span className="opt">(shown on the results review only)</span>
            <textarea rows={2} value={q.explanation} onChange={(e) => setQ('explanation', e.target.value)} /></label>
          <label className="field">Source <span className="opt">(never shown in the game; start with TEST for test content)</span>
            <input type="text" value={q.source} onChange={(e) => setQ('source', e.target.value)} /></label>
          {liveErrs.length > 0 && <ul className="err" style={{ margin: 0, paddingLeft: 18 }}>{liveErrs.map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="row">
            <button className="btn small" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save question'}</button>
            <button className="btn small ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {shown.length === 0 ? <p className="muted">No questions in this domain yet.</p> : (
        <div className="list">
          {shown.map((x) => (
            <div key={x.id} className="stack" style={{ gap: 4 }}>
              <div className="spread">
                <span className="small muted">{x.id} · difficulty {x.difficulty}{x.source ? ` · ${x.source}` : ''} {!x.enabled && <span className="pill dark">disabled</span>}</span>
                <span className="row">
                  <button className="linkbtn small" onClick={() => { setMsg(null); setEditing({ mode: 'edit', q: { ...x, options: [...x.options] } }); window.scrollTo({ top: 0 }); }}>Edit</button>
                  <button className="linkbtn small" onClick={() => remove(x)}>Delete</button>
                </span>
              </div>
              <span className="item-title">{x.questionText}</span>
              <span className="chips">{x.options.map((o, i) => (
                <span key={i} className={`pill ${i === x.correctIndex ? 'dark' : ''}`} style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13 }}>{o}</span>
              ))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
