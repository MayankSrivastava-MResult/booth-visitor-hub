'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { callApi } from '@/components/api';
import type { Settings } from '@/lib/data/team';

/* Lists are edited one item per line. */
const toLines = (a: string[]) => a.join('\n');
const fromLines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export default function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [s, setS] = useState({ ...initial, podcastTopics: toLines(initial.podcastTopics), demos: toLines(initial.demos) });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null); setFields({});
    const res = await callApi<{ consentVersion: number }>('/api/admin/settings', 'PUT', {
      badgePattern: s.badgePattern, badgeHint: s.badgeHint, noticeText: s.noticeText, marketingText: s.marketingText,
      podcastTopics: fromLines(s.podcastTopics), demos: fromLines(s.demos),
    });
    setBusy(false);
    if (res.ok) {
      const v = res.data.consentVersion;
      setMsg({ kind: 'ok', text: v !== s.consentVersion ? `Saved. Consent notice is now version ${v}.` : 'Saved.' });
      setS({ ...s, consentVersion: v });
      router.refresh();
    } else { setFields(res.data.fields ?? {}); setMsg({ kind: 'bad', text: res.data.error ?? 'Could not save.' }); }
  }

  const err = (k: string) => (fields[k] ? <span className="err">{fields[k]}</span> : null);

  return (
    <form className="stack" onSubmit={save} noValidate>
      <div className="card">
        <h2>Badge ID rule</h2>
        <label className="field">Pattern <span className="opt">(regular expression, checked after trimming and uppercasing)</span>
          <input type="text" value={s.badgePattern} onChange={(e) => setS({ ...s, badgePattern: e.target.value })} spellCheck={false} autoCapitalize="off" />
          <span className="hint">Default: ^[A-Z0-9-]{'{4,20}'}$ (4 to 20 letters, digits or hyphens).</span>{err('badgePattern')}</label>
        <label className="field">Hint shown to visitors
          <input type="text" value={s.badgeHint} onChange={(e) => setS({ ...s, badgeHint: e.target.value })} />{err('badgeHint')}</label>
      </div>
      <div className="card">
        <h2>Consent <span className="pill">version {s.consentVersion}</span></h2>
        <p className="small muted">Editing either text creates a new version. Each visitor keeps the version they agreed to.</p>
        <label className="field">Consent notice (required checkbox)
          <textarea rows={6} value={s.noticeText} onChange={(e) => setS({ ...s, noticeText: e.target.value })} />{err('noticeText')}</label>
        <label className="field">Marketing communications (optional checkbox)
          <textarea rows={3} value={s.marketingText} onChange={(e) => setS({ ...s, marketingText: e.target.value })} />{err('marketingText')}</label>
      </div>
      <div className="card">
        <h2>Lists</h2>
        <label className="field">Podcast topics <span className="opt">(one per line)</span>
          <textarea rows={8} value={s.podcastTopics} onChange={(e) => setS({ ...s, podcastTopics: e.target.value })} />{err('podcastTopics')}</label>
        <label className="field">Demos <span className="opt">(one per line)</span>
          <textarea rows={6} value={s.demos} onChange={(e) => setS({ ...s, demos: e.target.value })} />{err('demos')}</label>
      </div>
      {msg && <p className={`notice ${msg.kind}`} role="status">{msg.text}</p>}
      <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
  );
}
