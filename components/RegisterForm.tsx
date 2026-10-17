'use client';
/* Visitor registration form. Used by the public page (visitor's own phone,
 * reached by QR) and by staff-assisted mode on a booth tablet. Built to be
 * filled in under 60 seconds: one column, large fields, phone keyboards
 * matched to each field, autofill hints. */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { callApi } from './api';

export type RegisterConfig = { consentVersion: number; noticeText: string; marketingText: string; badgeHint: string };

type Props = {
  cfg: RegisterConfig;
  mode: 'public' | 'staff';
  initialBadge?: string;
  /** Staff mode: after registering, go straight to this path with ?badge=<id> (e.g. back to Log interaction). */
  continueTo?: string;
};

const EMPTY = { badgeId: '', fullName: '', company: '', jobTitle: '', email: '', mobile: '', linkedinUrl: '' };

export default function RegisterForm({ cfg, mode, initialBadge = '', continueTo }: Props) {
  const router = useRouter();
  const [v, setV] = useState({ ...EMPTY, badgeId: initialBadge });
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: 'bad' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ badgeId: string; status: 'created' | 'exists' } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV({ ...v, [k]: e.target.value });
    if (fields[k]) setFields({ ...fields, [k]: '' });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null); setFields({});
    const url = mode === 'public' ? '/api/public/register' : '/api/visitors';
    const res = await callApi<{ status?: string; badgeId?: string }>(url, 'POST', {
      ...v, consent, marketingOptIn: marketing, consentVersion: cfg.consentVersion,
    });
    setBusy(false);
    if (res.ok && res.data.status === 'created') {
      const badgeId = res.data.badgeId ?? v.badgeId.trim().toUpperCase();
      if (mode === 'staff' && continueTo) { router.push(`${continueTo}?badge=${encodeURIComponent(badgeId)}`); return; }
      setDone({ badgeId, status: 'created' });
      return;
    }
    if (res.status === 409 && res.data.status === 'exists') {
      if (mode === 'public') { setMsg({ kind: 'bad', text: 'This badge is already registered — please see the MResult team.' }); return; }
      setDone({ badgeId: v.badgeId.trim().toUpperCase(), status: 'exists' });
      return;
    }
    if (res.status === 409 && res.data.status === 'stale_consent') {
      setMsg({ kind: 'info', text: 'The consent notice was just updated. Please reload the page, read it and tick the box again.' });
      return;
    }
    if (res.data.fields) {
      setFields(res.data.fields);
      const first = Object.keys(res.data.fields)[0];
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    }
    setMsg({ kind: 'bad', text: res.data.error ?? 'Something went wrong. Please try again.' });
  }

  function again() {
    setV({ ...EMPTY }); setConsent(false); setMarketing(false); setDone(null); setMsg(null);
    window.scrollTo(0, 0);
  }

  if (done && mode === 'public') {
    return (
      <div className="card done" role="status">
        <div className="tick" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,12.5 10,17 19,7" /></svg>
        </div>
        <h2>Thank you!</h2>
        <p>You&rsquo;re registered with the MResult team.</p>
        <p className="notice info" style={{ marginTop: 8 }}>Use your badge ID <b>{done.badgeId}</b> to play Pharma Ninja at the booth.</p>
      </div>
    );
  }

  if (done && mode === 'staff') {
    const enc = encodeURIComponent(done.badgeId);
    return (
      <div className="card" role="status">
        {done.status === 'created'
          ? <p className="notice ok">Registered {done.badgeId}.</p>
          : <p className="notice info">{done.badgeId} is already registered.</p>}
        <div className="stack">
          <Link className="btn block" href={`/log?badge=${enc}`}>Log an interaction</Link>
          <Link className="btn ghost block" href={`/visitors/${enc}`}>Open visitor record</Link>
          <button className="btn ghost block" onClick={again}>Register another visitor</button>
        </div>
      </div>
    );
  }

  const err = (k: string) => fields[k] ? <span className="err" id={`${k}-err`}>{fields[k]}</span> : null;
  const inv = (k: string) => ({ 'aria-invalid': !!fields[k], 'aria-describedby': fields[k] ? `${k}-err` : undefined });

  return (
    <form ref={formRef} className="card" onSubmit={submit} noValidate>
      <label className="field">Badge ID
        <input name="badgeId" type="text" className="badge-input" value={v.badgeId} onChange={set('badgeId')} required
          autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} {...inv('badgeId')} />
        <span className="hint">As printed on the event badge: {cfg.badgeHint}.</span>
        {err('badgeId')}
      </label>
      <label className="field">Full name
        <input name="fullName" type="text" value={v.fullName} onChange={set('fullName')} required autoComplete="name" autoCapitalize="words" {...inv('fullName')} />
        {err('fullName')}
      </label>
      <label className="field">Company
        <input name="company" type="text" value={v.company} onChange={set('company')} required autoComplete="organization" {...inv('company')} />
        {err('company')}
      </label>
      <label className="field">Job title
        <input name="jobTitle" type="text" value={v.jobTitle} onChange={set('jobTitle')} required autoComplete="organization-title" {...inv('jobTitle')} />
        {err('jobTitle')}
      </label>
      <label className="field">Email
        <input name="email" type="email" inputMode="email" value={v.email} onChange={set('email')} required autoComplete="email" autoCapitalize="off" spellCheck={false} {...inv('email')} />
        {err('email')}
      </label>
      <label className="field">Mobile <span className="opt">(optional)</span>
        <input name="mobile" type="tel" inputMode="tel" value={v.mobile} onChange={set('mobile')} autoComplete="tel" {...inv('mobile')} />
        {err('mobile')}
      </label>
      <label className="field">LinkedIn profile <span className="opt">(optional)</span>
        <input name="linkedinUrl" type="url" inputMode="url" value={v.linkedinUrl} onChange={set('linkedinUrl')} placeholder="linkedin.com/in/…" autoCapitalize="off" spellCheck={false} {...inv('linkedinUrl')} />
        {err('linkedinUrl')}
      </label>

      <label className="check">
        <input name="consent" type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setFields({ ...fields, consent: '' }); }} {...inv('consent')} />
        <span>
          {mode === 'staff' && <b>The visitor has read this notice (or had it read to them) and agrees: </b>}
          {cfg.noticeText}
        </span>
      </label>
      {err('consent')}
      <label className="check">
        <input name="marketingOptIn" type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
        <span><span className="muted">Optional: </span>{cfg.marketingText}</span>
      </label>

      {msg && <p className={`notice ${msg.kind}`} role="alert">{msg.text}</p>}
      <button className="btn block" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Register'}</button>
    </form>
  );
}
