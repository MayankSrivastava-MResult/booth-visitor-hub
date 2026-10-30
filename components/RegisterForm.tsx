'use client';
/* Visitor registration form. The email is the visitor's identity (one record per email).
 * Used by:
 *   - the public page (visitor's own phone, reached by QR)
 *   - kiosk mode: the same public page opened INSIDE Pharma Ninja when an email is not
 *     registered (/register?kiosk=1&email=…). On save it hands the email and first name
 *     back to the game (postMessage, same site only); browser autofill is off so the
 *     next visitor never sees the previous visitor's details
 *   - staff-assisted mode on a booth tablet.
 * Built to be filled in under 60 seconds: one column, large fields, phone keyboards
 * matched to each field. */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { firstName } from '@/lib/first-name';
import { callApi } from './api';

export type RegisterConfig = { consentVersion: number; noticeText: string; marketingText: string };

type Props = {
  cfg: RegisterConfig;
  mode: 'public' | 'staff';
  initialEmail?: string;
  /** Staff mode: after registering, go straight to this path with ?email=<email> (e.g. back to Log interaction). */
  continueTo?: string;
  /** Public form opened inside the game (see above). */
  kiosk?: boolean;
};

/** Kiosk mode: tell the game page around us (same site only). */
function toGame(msg: Record<string, unknown>) {
  if (window.parent !== window) window.parent.postMessage(msg, window.location.origin);
}

const EMPTY = { email: '', fullName: '', company: '', jobTitle: '', mobile: '', linkedinUrl: '' };

export default function RegisterForm({ cfg, mode, initialEmail = '', continueTo, kiosk = false }: Props) {
  const router = useRouter();
  const [v, setV] = useState({ ...EMPTY, email: initialEmail });
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: 'bad' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ email: string; status: 'created' | 'exists' } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastPing = useRef(0);
  const ac = (hint: string) => (kiosk ? 'off' : hint);   // no autofill on a shared game screen

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV({ ...v, [k]: e.target.value });
    if (fields[k]) setFields({ ...fields, [k]: '' });
    // keep the game's idle timer from returning to attract mode while someone is typing
    if (kiosk && Date.now() - lastPing.current > 5000) { lastPing.current = Date.now(); toGame({ type: 'pn-activity' }); }
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null); setFields({});
    const url = mode === 'public' ? '/api/public/register' : '/api/visitors';
    const res = await callApi<{ status?: string; email?: string }>(url, 'POST', {
      ...v, consent, marketingOptIn: marketing, consentVersion: cfg.consentVersion,
    });
    setBusy(false);
    if (res.ok && res.data.status === 'created') {
      const email = res.data.email ?? v.email.trim().toLowerCase();
      if (mode === 'staff' && continueTo) { router.push(`${continueTo}?email=${encodeURIComponent(email)}`); return; }
      if (kiosk) toGame({ type: 'pn-registered', email, firstName: firstName(v.fullName) });
      setDone({ email, status: 'created' });
      return;
    }
    if (res.status === 409 && res.data.status === 'exists') {
      if (mode === 'public') {
        setMsg({ kind: 'bad', text: kiosk
          ? 'This email is already registered. Tap “Back to the game” and check the email you typed.'
          : 'This email is already registered — please see the MResult team.' });
        return;
      }
      setDone({ email: v.email.trim().toLowerCase(), status: 'exists' });
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

  if (done && mode === 'public' && kiosk) {
    return <div className="card done" role="status"><h2>Registered!</h2><p>Taking you back to the game…</p></div>;
  }

  if (done && mode === 'public') {
    return (
      <div className="card done" role="status">
        <div className="tick" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,12.5 10,17 19,7" /></svg>
        </div>
        <h2>Thank you!</h2>
        <p>You&rsquo;re registered with the MResult team.</p>
        <p className="notice info" style={{ marginTop: 8 }}>To play Pharma Ninja at the booth, type your email <b>{done.email}</b> on the game screen.</p>
      </div>
    );
  }

  if (done && mode === 'staff') {
    const enc = encodeURIComponent(done.email);
    return (
      <div className="card" role="status">
        {done.status === 'created'
          ? <p className="notice ok">Registered {done.email}.</p>
          : <p className="notice info">{done.email} is already registered.</p>}
        <div className="stack">
          <Link className="btn block" href={`/log?email=${enc}`}>Log an interaction</Link>
          <Link className="btn ghost block" href={`/visitors/${enc}`}>Open visitor record</Link>
          <button className="btn ghost block" onClick={again}>Register another visitor</button>
        </div>
      </div>
    );
  }

  const err = (k: string) => fields[k] ? <span className="err" id={`${k}-err`}>{fields[k]}</span> : null;
  const inv = (k: string) => ({ 'aria-invalid': !!fields[k], 'aria-describedby': fields[k] ? `${k}-err` : undefined });

  return (
    <form ref={formRef} className="card" onSubmit={submit} noValidate autoComplete={kiosk ? 'off' : undefined}>
      <label className="field">Email
        <input name="email" type="email" inputMode="email" value={v.email} onChange={set('email')} required autoComplete={ac('email')}
          autoCapitalize="off" autoCorrect="off" spellCheck={false} {...inv('email')} />
        <span className="hint">Your work email. It&rsquo;s how we recognise you at the booth and in the game.</span>
        {err('email')}
      </label>
      <label className="field">Full name
        <input name="fullName" type="text" value={v.fullName} onChange={set('fullName')} required autoComplete={ac('name')} autoCapitalize="words" {...inv('fullName')} />
        {err('fullName')}
      </label>
      <label className="field">Company
        <input name="company" type="text" value={v.company} onChange={set('company')} required autoComplete={ac('organization')} {...inv('company')} />
        {err('company')}
      </label>
      <label className="field">Job title
        <input name="jobTitle" type="text" value={v.jobTitle} onChange={set('jobTitle')} required autoComplete={ac('organization-title')} {...inv('jobTitle')} />
        {err('jobTitle')}
      </label>
      <label className="field">Mobile <span className="opt">(optional)</span>
        <input name="mobile" type="tel" inputMode="tel" value={v.mobile} onChange={set('mobile')} autoComplete={ac('tel')} {...inv('mobile')} />
        {err('mobile')}
      </label>
      <label className="field">LinkedIn profile <span className="opt">(optional)</span>
        <input name="linkedinUrl" type="url" inputMode="url" value={v.linkedinUrl} onChange={set('linkedinUrl')} placeholder="linkedin.com/in/…" autoComplete={ac('url')} autoCapitalize="off" spellCheck={false} {...inv('linkedinUrl')} />
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
