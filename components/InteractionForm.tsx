'use client';
/* Log interaction (and edit an existing one). Phone-first, built for speed:
 *   1. type or paste the badge ID → the visitor's name, company and title appear for confirmation
 *      (or "not registered → register now", which comes back here afterwards)
 *   2. pick the type: Conversation / Podcast guest / Demo seen / Other
 *   3. fill the few fields for that type and save.
 * "Met by" defaults to the signed-in person. */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { callApi } from './api';

export type TeamOption = { id: string; displayName: string };
export type Lists = { podcastTopics: string[]; demos: string[]; domainTags: string[] };
type Type = 'conversation' | 'podcast' | 'demo' | 'other';
type Who = { badgeId: string; fullName: string; company: string; jobTitle: string };

export type InteractionValues = {
  type: Type; metBy: string; problemStatement: string; domainTags: string[]; interestLevel: '' | 'hot' | 'warm' | 'cold';
  nextStep: string; followUpOwner: string; followUpDate: string; podcastTopic: string; podcastConsentSigned: boolean | null;
  demoName: string; notes: string;
};

type Props = {
  me: TeamOption;
  team: TeamOption[];
  lists: Lists;
  initialBadge?: string;
  /** Editing: the interaction id, its values and its visitor (badge is fixed). */
  existing?: { id: string; values: InteractionValues; who: Who };
  onSaved?: () => void;
};

const TYPES: { k: Type; label: string }[] = [
  { k: 'conversation', label: 'Conversation' }, { k: 'podcast', label: 'Podcast' }, { k: 'demo', label: 'Demo' }, { k: 'other', label: 'Other' },
];

const blank = (me: string): InteractionValues => ({
  type: 'conversation', metBy: me, problemStatement: '', domainTags: [], interestLevel: '', nextStep: '', followUpOwner: '',
  followUpDate: '', podcastTopic: '', podcastConsentSigned: null, demoName: '', notes: '',
});

export default function InteractionForm({ me, team, lists, initialBadge = '', existing, onSaved }: Props) {
  const [badge, setBadge] = useState(existing?.who.badgeId ?? initialBadge);
  const [who, setWho] = useState<Who | null>(existing?.who ?? null);
  const [lookup, setLookup] = useState<'idle' | 'busy' | 'missing' | 'error'>('idle');
  const [v, setV] = useState<InteractionValues>(existing?.values ?? blank(me.id));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  async function find(raw: string) {
    const b = raw.trim().toUpperCase();
    if (!b) { setWho(null); setLookup('idle'); return; }
    const mine = ++seq.current;
    setLookup('busy');
    const res = await callApi<{ found: boolean } & Who>(`/api/visitors/${encodeURIComponent(b)}/summary`, 'GET');
    if (mine !== seq.current) return;                     // a newer lookup has started
    if (!res.ok) { setLookup('error'); setWho(null); return; }
    if (res.data.found) { setWho(res.data); setLookup('idle'); } else { setWho(null); setLookup('missing'); }
  }

  // Look the badge up shortly after typing stops (and straight away for a prefilled badge).
  useEffect(() => {
    if (existing) return;
    if (!badge.trim()) { setWho(null); setLookup('idle'); return; }
    if (who && who.badgeId === badge.trim().toUpperCase()) return;
    const t = setTimeout(() => find(badge), initialBadge && badge === initialBadge ? 0 : 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badge]);

  const set = <K extends keyof InteractionValues>(k: K, val: InteractionValues[K]) => {
    setV((cur) => ({ ...cur, [k]: val }));
    if (fields[k]) setFields((f) => ({ ...f, [k]: '' }));
  };

  function body() {
    const b = who!.badgeId;
    switch (v.type) {
      case 'conversation': return { type: v.type, badgeId: b, metBy: v.metBy, problemStatement: v.problemStatement, domainTags: v.domainTags,
        interestLevel: v.interestLevel || undefined, nextStep: v.nextStep, followUpOwner: v.followUpOwner || null, followUpDate: v.followUpDate || null };
      case 'podcast': return { type: v.type, badgeId: b, podcastTopic: v.podcastTopic, notes: v.notes, podcastConsentSigned: v.podcastConsentSigned ?? undefined };
      case 'demo': return { type: v.type, badgeId: b, demoName: v.demoName, notes: v.notes };
      case 'other': return { type: v.type, badgeId: b, notes: v.notes };
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

  function newVisitor() { setBadge(''); setWho(null); setLookup('idle'); setMsg(null); setV(blank(me.id)); }

  const err = (k: string) => (fields[k] ? <span className="err">{fields[k]}</span> : null);
  const encBadge = encodeURIComponent(badge.trim().toUpperCase());

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
        {existing ? (
          <div className="who-box"><span className="nm">{who!.fullName}</span><span>{who!.jobTitle} · {who!.company}</span><span className="small muted">{who!.badgeId}</span></div>
        ) : (
          <>
            <label className="field">Badge ID
              <input type="text" className="badge-input" value={badge} onChange={(e) => setBadge(e.target.value)}
                autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="Type or paste" />
            </label>
            {lookup === 'busy' && <p className="hint">Looking up…</p>}
            {lookup === 'error' && <p className="notice bad">Could not look that up. Check the connection.</p>}
            {lookup === 'missing' && (
              <div className="notice info stack">
                <span>{badge.trim().toUpperCase()} is not registered yet.</span>
                <Link className="btn small dark" href={`/staff-register?badge=${encBadge}&continue=/log`}>Register them now</Link>
              </div>
            )}
            {who && <div className="who-box"><span className="nm">{who.fullName}</span><span>{who.jobTitle} · {who.company}</span></div>}
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
