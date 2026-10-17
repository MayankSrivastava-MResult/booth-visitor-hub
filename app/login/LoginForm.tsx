'use client';
import { useState } from 'react';
import { callApi } from '@/components/api';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const res = await callApi('/api/auth/login', 'POST', { email, password });
    if (res.ok) { window.location.href = '/'; return; }
    setBusy(false);
    setMsg(res.data.error ?? 'Could not sign in.');
  }

  return (
    <form className="card" onSubmit={submit}>
      <label className="field">Work email
        <input type="email" inputMode="email" autoComplete="username" autoCapitalize="off" spellCheck={false}
          value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field">Password
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {msg && <p className="notice bad" role="alert">{msg}</p>}
      <button className="btn block" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="hint">You stay signed in on this phone for 7 days. Forgot your password? Ask the MResult admin to reset it.</p>
    </form>
  );
}
