'use client';
/* Log interaction (and edit an existing one). Phone-first, built for speed:
 *   1. find the visitor: type part of their name, company or email and tap them in the list
 *      (nobody found → "Register them now", which comes back here afterwards)
 *   2. pick the type: Conversation / Podcast guest / Demo seen / Other
 *   3. fill the few fields for that type. A new entry saves itself as it is filled in
 *      (about a second after typing stops, and when the page is left), so nothing is lost
 *      if there's no time to reach the end; "Save and finish" closes it.
 * Conversations have meeting minutes: formatted text with a dictation mic (RichTextEditor).
 * A follow-up date can't be in the past. "Met by" defaults to the signed-in person. People pre-seeded from the organisers' list
 * show "not registered yet", with a link to complete their registration. */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { callApi } from './api';
import RichTextEditor from './RichTextEditor';

export type TeamOption = { id: string; displayName: string };
export type Lists = { podcastTopics: string[]; demos: string[]; domainTags: string[] };
type Type = 'conversation' | 'podcast' | 'demo' | 'other';
type Who = { id: string; email: string | null; fullName: string; company: string; jobTitle: string | null; registered: boolean };

export type InteractionValues = {
  type: Type; metBy: string; problemStatement: string; domainTags: string[]; interestLevel: '' | 'hot' | 'warm' | 'cold';
  nextStep: string; followUpOwner: string; followUpDate: string; podcastTopic: string; podcastConsentSigned: boolean | null;
  demoName: string; notes: string; minutes: string;
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
const AUTOSAVE_MS = 1200;
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const hasText = (html: string) => !!html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();

/** Worth saving on its own: anything typed or picked beyond the type itself. */
function hasContent(v: InteractionValues) {
  switch (v.type) {
    case 'conversation': return !!(v.interestLevel || v.problemStatement.trim() || v.domainTags.length || hasText(v.minutes)
      || v.nextStep.trim() || v.followUpOwner || v.followUpDate);
    case 'podcast': return !!(v.podcastTopic && v.podcastConsentSigned !== null);
    case 'demo': return !!v.demoName;
    case 'other': return !!v.notes.trim();
  }
}

function bodyFor(v: InteractionValues, visitorId: string) {
  switch (v.type) {
    case 'conversation': return { type: v.type, visitorId, metBy: v.metBy, problemStatement: v.problemStatement, domainTags: v.domainTags,
      interestLevel: v.interestLevel || null, minutes: hasText(v.minutes) ? v.minutes : null, nextStep: v.nextStep,
      followUpOwner: v.followUpOwner || null, followUpDate: v.followUpDate || null };
    case 'podcast': return { type: v.type, visitorId, podcastTopic: v.podcastTopic, notes: v.notes, podcastConsentSigned: v.podcastConsentSigned ?? undefined };
    case 'demo': return { type: v.type, visitorId, demoName: v.demoName, notes: v.notes };
    case 'other': return { type: v.type, visitorId, notes: v.notes };
  }
}

type SaveState = { kind: 'idle' | 'saving' | 'saved' | 'invalid' | 'offline'; at?: Date; text?: string };

const blank = (me: string): InteractionValues => ({
  type: 'conversation', metBy: me, problemStatement: '', domainTags: [], interestLevel: '', nextStep: '', followUpOwner: '',
  followUpDate: '', podcastTopic: '', podcastConsentSigned: null, demoName: '', notes: '', minutes: '',
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
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [editorKey, setEditorKey] = useState(0);   // bumped to load the minutes editor afresh
  const seq = useRef(0);
  // Autosave (new entries only). Refs, so saves queued from timers and page events see the latest values.
  const vRef = useRef(v), whoRef = useRef(who);
  const draftId = useRef<string | null>(null), dirty = useRef(false), chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  vRef.current = v; whoRef.current = who;

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
    dirty.current = true;
  };

  /** Save the current values of a new entry (create it the first time, then update it).
   *  Saves run one after another, so the first one's id is known before the next. */
  function persist(force = false): Promise<boolean> {
    chain.current = chain.current.then(async () => {
      const w = whoRef.current, cur = vRef.current;
      if (!w || (!dirty.current && !force)) return true;
      if (!force && !draftId.current && !hasContent(cur)) return true;
      dirty.current = false;
      setSaveState({ kind: 'saving' });
      let res: Response | null = null;
      const body = JSON.stringify(bodyFor(cur, w.id));
      try {
        res = await fetch(draftId.current ? `/api/interactions/${draftId.current}` : '/api/interactions', {
          method: draftId.current ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body, credentials: 'same-origin',
          keepalive: body.length < 60000,   // still sent if the page is closing (browsers cap that at 64 KB)
        });
      } catch { /* offline */ }
      const data = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok) {
        if (!draftId.current && data.id) draftId.current = data.id;
        setSaveState({ kind: 'saved', at: new Date() });
        return true;
      }
      dirty.current = true;
      if (res && res.status === 400) {
        setFields(data.fields ?? {});
        const first = Object.values((data.fields ?? {}) as Record<string, string>).find(Boolean);
        setSaveState({ kind: 'invalid', text: first ?? data.error ?? 'Check the highlighted fields.' });
      } else {
        setSaveState({ kind: 'offline', text: res ? (data.error ?? `Error ${res.status}`) : 'No connection' });
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => persist(), 5000);   // try again shortly
      }
      return false;
    });
    return chain.current;
  }

  // New entries save themselves shortly after each change.
  useEffect(() => {
    if (existing || !who || !dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(), AUTOSAVE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, who]);

  // Leaving the page or locking the phone: save what's there now.
  useEffect(() => {
    if (existing) return;
    const flush = () => { if (dirty.current) persist(); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHide); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startFresh() {
    if (timer.current) clearTimeout(timer.current);
    draftId.current = null; dirty.current = false;
    setV(blank(me.id)); setEditorKey((k) => k + 1); setSaveState({ kind: 'idle' }); setFields({});
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!who || busy) return;
    setBusy(true); setMsg(null); setFields({});
    if (existing) {
      const res = await callApi(`/api/interactions/${existing.id}`, 'PATCH', bodyFor(v, who.id));
      setBusy(false);
      if (res.ok) { onSaved?.(); return; }
      if (res.data.fields) setFields(res.data.fields);
      setMsg({ kind: 'bad', text: res.data.error ?? 'Could not save. Try again.' });
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    const ok = await persist(!draftId.current);   // nothing saved yet: save it now even if it's just "met"
    setBusy(false);
    if (ok) {
      setMsg({ kind: 'ok', text: `Saved for ${who.fullName}.` });
      startFresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function pick(w: Who) { setWho(w); setResults([]); setSearch('idle'); setMsg(null); }
  async function newVisitor() {
    if (dirty.current) await persist();
    setQuery(''); setWho(null); setResults([]); setSearch('idle'); setMsg(null); startFresh();
  }

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
            <label className="field">Interest <span className="opt">(optional)</span>
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
            <div className="field"><span>Minutes <span className="opt">(optional)</span></span>
              <RichTextEditor label="Minutes" value={v.minutes} resetKey={`${existing?.id ?? ''}${editorKey}`}
                onChange={(html) => set('minutes', html)} />
              {err('minutes')}
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
              <input type="date" value={v.followUpDate} min={existing?.values.followUpDate && existing.values.followUpDate < istToday()
                ? existing.values.followUpDate : istToday()} onChange={(e) => set('followUpDate', e.target.value)} />
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
          {!existing && saveState.kind !== 'idle' && (
            <p className={`save-state${saveState.kind === 'invalid' || saveState.kind === 'offline' ? ' bad' : ''}`} role="status">
              {saveState.kind === 'saving' && 'Saving…'}
              {saveState.kind === 'saved' && `Saved automatically at ${saveState.at!.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`}
              {saveState.kind === 'invalid' && `Not saved yet: ${saveState.text}`}
              {saveState.kind === 'offline' && `Not saved yet (${saveState.text}). Trying again…`}
            </p>
          )}
          <button className="btn block" type="submit" disabled={busy}>{busy ? 'Saving…' : existing ? 'Save changes' : 'Save and finish'}</button>
        </div>
      )}
    </form>
  );
}
