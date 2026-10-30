'use client';
/* Log interaction (and edit an existing one). Phone-first, built for speed:
 *   1. find the visitor: type part of their name, company or email and tap them in the list
 *      (nobody found → "Register them now", which comes back here afterwards)
 *   2. pick the type: Conversation / Podcast guest / Demo seen / Other
 *   3. fill the few fields for that type and save.
 * "Met by" defaults to the signed-in person. People pre-seeded from the organisers' list
 * show "not registered yet", with a link to complete their registration. */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { callApi } from './api';

export type TeamOption = { id: string; displayName: string };
export type Lists = { podcastTopics: string[]; demos: string[]; domainTags: string[] };
type Type = 'conversation' | 'podcast' | 'demo' | 'other';
type Who = { id: string; email: string | null; fullName: string; company: string; jobTitle: string | null; registered: boolean };

export type InteractionValues = {
  type: Type; metBy: string; problemStatement: string; domainTags: string[]; interestLevel: '' | 'hot' | 'warm' | 'cold';
  nextStep: string; followUpOwner: string; followUpDate: string; podcastTopic: string; podcastConsentSigned: boolean | null;
  demoName: string; notes: string;
};

type Props = {
  me: TeamOption;
  team: TeamOption[];
  lists: Lists;
  /** Preselect this visitor (e.g. after registering a walk-in, or from their visitor page). */
  initialVisitorId?: string;
  /** Editing: the interaction id, its values and its visitor (the visitor is fixed). */
  existing?: { id: string; values: InteractionValues; who: Who };
  onSaved?: () => void;
};

const TYPES: { k: Type; label: string }[] = [
  { k: 'conversation', label: 'Conversation' }, { k: 'podcast', label: 'Podcast' }, { k: 'demo', label: 'Demo' }, { k: 'other', label: 'Other' },
];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const role = (w: Who) => [w.jobTitle, w.company].filter(Boolean).join(' · ');

const blank = (me: string): InteractionValues => ({
  type: 'conversation', metBy: me, problemStatement: '', domainTags: [], interestLevel: '', nextStep: '', followUpOwner: '',
  followUpDate: '', podcastTopic: '', podcastConsentSigned: null, demoName: '', notes: '',
});

export default function InteractionForm({ me, team, lists, initialVisitorId = '', existing, onSaved }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Who[]>([]);
  const [search, setSearch] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [who, setWho] = useState<Who | null>(existing?.who ?? null);
  const [v, setV] = useState<InteractionValues>(existing?.values ?? blank(me.id));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // A visitor handed in by id (after registering, or from their visitor page) is selected straight away.
  useEffect(() => {
    if (existing || !initialVisitorId) return;
    callApi<{ found: boolean } & Who>(`/api/visitors/${initialVisitorId}/summary`, 'GET')
      .then((res) => { if (res.ok && res.data.found) setWho(res.data); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search as they type (name, company or email), shortly after typing stops.
  useEffect(() => {
    if (existing || who) return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearch('idle'); return; }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setSearch('busy');
      const res = await callApi<{ items: Who[] }>(`/api/visitors?q=${encodeURIComponent(q)}`, 'GET');
      if (mine !== seq.current) return;                     // a newer search has started
      if (!res.ok) { setSearch('error'); setResults([]); return; }
      setResults(res.data.items.slice(0, 8)); setSearch('done');
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, who]);

  const set = <K extends keyof InteractionValues>(k: K, val: InteractionValues[K]) => {
    setV((cur) => ({ ...cur, [k]: val }));
    if (fields[k]) setFields((f) => ({ ...f, [k]: '' }));
  };

  function body() {
    const e = who!.id;
    switch (v.type) {
      case 'conversation': return { type: v.type, visitorId: e, metBy: v.metBy, problemStatement: v.problemStatement, domainTags: v.domainTags,
        interestLevel: v.interestLevel || undefined, nextStep: v.nextStep, followUpOwner: v.followUpOwner || null, followUpDate: v.followUpDate || null };
      case 'podcast': return { type: v.type, visitorId: e, podcastTopic: v.podcastTopic, notes: v.notes, podcastConsentSigned: v.podcastConsentSigned ?? undefined };
      case 'demo': return { type: v.type, visitorId: e, demoName: v.demoName, notes: v.notes };
      case 'other': return { type: v.type, visitorId: e, notes: v.notes };
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!who || busy) return;
    setBusy(true); setMsg(null); setFields({});
    const res = existing
      ? await callApi(`/api/interactions/${existing.id}`, 'PATCH', body())
      : await callApi('/api/interactions', 'POST', body());
    setBusy(false);
    if (res.ok) {
      if (existing) { onSaved?.(); return; }
      setMsg({ kind: 'ok', text: `Saved for ${who.fullName}.` });
      setV(blank(me.id));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (res.data.fields) setFields(res.data.fields);
    setMsg({ kind: 'bad', text: res.data.error ?? 'Could not save. Try again.' });
  }

  function pick(w: Who) { setWho(w); setResults([]); setSearch('idle'); setMsg(null); }
  function newVisitor() { setQuery(''); setWho(null); setResults([]); setSearch('idle'); setMsg(null); setV(blank(me.id)); }

  const err = (k: string) => (fields[k] ? <span className="err">{fields[k]}</span> : null);
  const q = query.trim();
  const registerHref = `/staff-register?continue=/log${q ? `&${EMAIL_RE.test(q) ? 'email' : 'name'}=${encodeURIComponent(EMAIL_RE.test(q) ? q.toLowerCase() : q)}` : ''}`;

  return (
    <form className="stack" onSubmit={save} noValidate>
      {msg?.kind === 'ok' && (
        <div className="card">
          <p className="notice ok" role="status">{msg.text}</p>
          <div className="row">
            <button type="button" className="btn small" onClick={() => setMsg(null)}>Log another for {who?.fullName.split(' ')[0]}</button>
            <button type="button" className="btn small ghost" onClick={newVisitor}>Next visitor</button>
          </div>
        </div>
      )}

      <div className="card">
        {who ? (
          <div className="who-box">
            <span className="nm">{who.fullName}</span><span>{role(who)}</span>{who.email && <span className="small muted">{who.email}</span>}
            {!who.registered && <span className="small">On the organisers&rsquo; list, not registered yet.{' '}
              <Link href={`/staff-register?complete=${who.id}`}>Complete their registration</Link></span>}
            {!existing && <button type="button" className="linkbtn small" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={newVisitor}>Change visitor</button>}
          </div>
        ) : (
          <>
            <label className="field">Find the visitor
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, company or email"
                autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="search" />
            </label>
            {search === 'busy' && results.length === 0 && <p className="hint">Searching…</p>}
            {search === 'error' && <p className="notice bad">Could not search. Check the connection.</p>}
            {results.length > 0 && (
              <div className="list pick-list" role="listbox" aria-label="Matching visitors">
                {results.map((r) => (
                  <button type="button" key={r.id} role="option" aria-selected={false} className="pick" onClick={() => pick(r)}>
                    <span className="item-title">{r.fullName}{!r.registered && <> <span className="pill">pre-seeded</span></>}</span>
                    <span className="small muted">{role(r)}</span>
                    {r.email && <span className="small muted">{r.email}</span>}
                  </button>
                ))}
              </div>
            )}
            {search === 'done' && results.length === 0 && (
              <div className="notice info stack">
                <span>No visitor matches &ldquo;{q}&rdquo;.</span>
                <Link className="btn small dark" href={registerHref}>Register them now</Link>
              </div>
            )}
          </>
        )}
      </div>

      {who && (
        <div className="card">
          <div className="seg" role="radiogroup" aria-label="Type">
            {TYPES.map((t) => (
              <button type="button" key={t.k} role="radio" aria-checked={v.type === t.k} className={v.type === t.k ? 'on' : ''}
                onClick={() => set('type', t.k)}>{t.label}</button>
            ))}
          </div>

          {v.type === 'conversation' && <>
            <label className="field">Interest
              <div className="seg" role="radiogroup" aria-label="Interest level">
                {(['hot', 'warm', 'cold'] as const).map((l) => (
                  <button type="button" key={l} role="radio" aria-checked={v.interestLevel === l} className={v.interestLevel === l ? 'on' : ''}
                    onClick={() => set('interestLevel', l)}>{l[0].toUpperCase() + l.slice(1)}</button>
                ))}
              </div>
              {err('interestLevel')}
            </label>
            <label className="field">Problem statement <span className="opt">(optional)</span>
              <textarea value={v.problemStatement} onChange={(e) => set('problemStatement', e.target.value)} />
              {err('problemStatement')}
            </label>
            <div className="field"><span>Domains <span className="opt">(optional)</span></span>
              <div className="chips">
                {lists.domainTags.map((t) => {
                  const on = v.domainTags.includes(t);
                  return <button type="button" key={t} className={on ? 'on' : ''} aria-pressed={on}
                    onClick={() => set('domainTags', on ? v.domainTags.filter((x) => x !== t) : [...v.domainTags, t])}>{t}</button>;
                })}
              </div>
              {err('domainTags')}
            </div>
            <label className="field">Next step <span className="opt">(optional)</span>
              <input type="text" value={v.nextStep} onChange={(e) => set('nextStep', e.target.value)} />
              {err('nextStep')}
            </label>
            <div className="grid-2 stack">
              <label className="field">Met by
                <select value={v.metBy} onChange={(e) => set('metBy', e.target.value)}>
                  {team.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                </select>
                {err('metBy')}
              </label>
              <label className="field">Follow-up owner <span className="opt">(optional)</span>
                <select value={v.followUpOwner} onChange={(e) => set('followUpOwner', e.target.value)}>
                  <option value="">—</option>
                  {team.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                </select>
              </label>
            </div>
            <label className="field">Follow-up date <span className="opt">(optional)</span>
              <input type="date" value={v.followUpDate} onChange={(e) => set('followUpDate', e.target.value)} />
              {err('followUpDate')}
            </label>
          </>}

          {v.type === 'podcast' && <>
            <label className="field">Topic
              {lists.podcastTopics.length
                ? <select value={v.podcastTopic} onChange={(e) => set('podcastTopic', e.target.value)}>
                    <option value="">Pick a topic</option>
                    {lists.podcastTopics.map((t) => <option key={t}>{t}</option>)}
                  </select>
                : <><input type="text" value={v.podcastTopic} onChange={(e) => set('podcastTopic', e.target.value)} />
                    <span className="hint">The admin has not added the topic list yet, so type the topic.</span></>}
              {err('podcastTopic')}
            </label>
            <label className="field">Consent form signed?
              <div className="seg" role="radiogroup" aria-label="Consent form signed">
                {[true, false].map((b) => (
                  <button type="button" key={String(b)} role="radio" aria-checked={v.podcastConsentSigned === b}
                    className={v.podcastConsentSigned === b ? 'on' : ''} onClick={() => set('podcastConsentSigned', b)}>{b ? 'Yes' : 'No'}</button>
                ))}
              </div>
              {err('podcastConsentSigned')}
            </label>
          </>}

          {v.type === 'demo' && (
            <label className="field">Demo
              {lists.demos.length
                ? <select value={v.demoName} onChange={(e) => set('demoName', e.target.value)}>
                    <option value="">Pick a demo</option>
                    {lists.demos.map((t) => <option key={t}>{t}</option>)}
                  </select>
                : <><input type="text" value={v.demoName} onChange={(e) => set('demoName', e.target.value)} />
                    <span className="hint">The admin has not added the demo list yet, so type the demo name.</span></>}
              {err('demoName')}
            </label>
          )}

          {v.type !== 'conversation' && (
            <label className="field">{v.type === 'other' ? 'Note' : <>Notes <span className="opt">(optional)</span></>}
              <textarea value={v.notes} onChange={(e) => set('notes', e.target.value)} />
              {err('notes')}
            </label>
          )}

          {msg?.kind === 'bad' && <p className="notice bad" role="alert">{msg.text}</p>}
          <button className="btn block" type="submit" disabled={busy}>{busy ? 'Saving…' : existing ? 'Save changes' : 'Save'}</button>
        </div>
      )}
    </form>
  );
}
