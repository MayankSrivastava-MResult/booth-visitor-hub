/* Visitor detail: profile, then a timeline of every touchpoint, newest first:
 * conversations, podcast, demos, notes and Pharma Ninja rounds.
 * Staff can edit/delete the interactions they logged; admins any, and can edit the profile. */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { domainTagOptions, getSettings, listTeam } from '@/lib/data/team';
import { visitorDetail, type TimelineItem } from '@/lib/data/visitors';
import { requireUser } from '@/lib/session';
import { formatIst } from '@/lib/time';
import { badgeFromParam } from '@/lib/validation';
import EditVisitor from './EditVisitor';
import InteractionActions from './InteractionActions';

export const metadata: Metadata = { title: 'Visitor' };

const TYPE_LABEL = { conversation: 'Conversation', podcast: 'Podcast guest', demo: 'Demo seen', other: 'Note' } as const;

export default async function VisitorPage({ params }: { params: Promise<{ badge: string }> }) {
  const user = await requireUser();
  const badge = badgeFromParam((await params).badge);
  const detail = await visitorDetail(user, badge);
  if (!detail) notFound();
  const { visitor: v, timeline } = detail;
  const [team, settings, domainTags] = await Promise.all([listTeam(user, { peopleOnly: true }), getSettings(user), domainTagOptions(user)]);
  const lists = { podcastTopics: settings.podcastTopics, demos: settings.demos, domainTags };
  const teamOpts = team.map((t) => ({ id: t.id, displayName: t.displayName }));
  const who = { badgeId: v.badgeId, fullName: v.fullName, company: v.company, jobTitle: v.jobTitle };

  return (
    <main className="page">
      <div className="spread">
        <div className="stack" style={{ gap: 2 }}>
          <h1>{v.fullName}</h1>
          <span className="muted">{v.jobTitle} · {v.company}</span>
        </div>
        <Link className="btn" href={`/log?badge=${encodeURIComponent(v.badgeId)}`}>Log interaction</Link>
      </div>

      <div className="card">
        <dl className="kv">
          <dt>Badge ID</dt><dd><b>{v.badgeId}</b></dd>
          <dt>Email</dt><dd><a href={`mailto:${v.email}`}>{v.email}</a></dd>
          <dt>Mobile</dt><dd>{v.mobile ? <a href={`tel:${v.mobile}`}>{v.mobile}</a> : '—'}</dd>
          <dt>LinkedIn</dt><dd>{v.linkedinUrl ? <a href={v.linkedinUrl} target="_blank" rel="noopener noreferrer">{v.linkedinUrl.replace(/^https:\/\/(www\.)?/, '')}</a> : '—'}</dd>
          <dt>Registered</dt><dd>{formatIst(v.createdAt)} · {v.registrationMode === 'self' ? 'self (QR)' : `by ${v.createdByName ?? 'team'}`}</dd>
          <dt>Consent</dt><dd>Yes (notice v{v.consentVersion}, {formatIst(v.consentAt)}) · Marketing: {v.marketingOptIn ? 'yes' : 'no'}</dd>
          {v.updatedByName && <><dt>Last edited</dt><dd>{formatIst(v.updatedAt)} by {v.updatedByName}</dd></>}
        </dl>
        {user.role === 'admin' && <p className="small"><a href={`/admin/data?badge=${encodeURIComponent(v.badgeId)}`}>Delete this visitor and all their records…</a></p>}
        {user.role === 'admin' && <EditVisitor visitor={{ badgeId: v.badgeId, fullName: v.fullName, company: v.company, jobTitle: v.jobTitle,
          email: v.email, mobile: v.mobile ?? '', linkedinUrl: v.linkedinUrl ?? '', marketingOptIn: v.marketingOptIn }} />}
      </div>

      <h2>Timeline</h2>
      <div className="card">
        {timeline.length === 0 ? <p className="muted">No interactions or game rounds yet.</p> : (
          <div className="list">
            {timeline.map((t) => <TimelineRow key={t.kind === 'game' ? t.roundId : t.id} t={t}
              canEdit={t.kind === 'interaction' && (user.role === 'admin' || t.createdBy === user.id)}
              actions={t.kind === 'interaction'
                ? <InteractionActions id={t.id} who={who} me={{ id: user.id, displayName: user.displayName }} team={teamOpts} lists={lists}
                    values={{ type: t.type, metBy: t.metBy ?? user.id, problemStatement: t.problemStatement ?? '', domainTags: t.domainTags ?? [],
                      interestLevel: (t.interestLevel ?? '') as '' | 'hot' | 'warm' | 'cold', nextStep: t.nextStep ?? '',
                      followUpOwner: t.followUpOwner ?? '', followUpDate: t.followUpDate ?? '', podcastTopic: t.podcastTopic ?? '',
                      podcastConsentSigned: t.podcastConsentSigned, demoName: t.demoName ?? '', notes: t.notes ?? '' }} />
                : null} />)}
          </div>
        )}
      </div>
    </main>
  );
}

function TimelineRow({ t, canEdit, actions }: { t: TimelineItem; canEdit: boolean; actions: React.ReactNode }) {
  if (t.kind === 'game') {
    return (
      <div className="stack" style={{ gap: 4 }}>
        <div className="spread"><span><span className="pill dark">Pharma Ninja</span> <b>{t.score.toLocaleString('en-IN')}</b> pts</span>
          <span className="small muted">{formatIst(t.at)}</span></div>
        <span className="small">{t.domainName} · {t.correct}/{t.questions} correct · played as “{t.displayName}”{t.badgeConfirmed ? '' : ' · badge not confirmed by player'}</span>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="spread">
        <span><span className="pill">{TYPE_LABEL[t.type]}</span>{' '}
          {t.interestLevel && <span className={`pill ${t.interestLevel}`}>{t.interestLevel}</span>}</span>
        <span className="small muted">{formatIst(t.at)} · {t.createdByName}</span>
      </div>
      {t.type === 'conversation' && <>
        {t.problemStatement && <p>{t.problemStatement}</p>}
        <span className="small muted">Met by {t.metByName}{t.domainTags?.length ? ` · ${t.domainTags.join(', ')}` : ''}</span>
        {t.nextStep && <span className="small"><b>Next step:</b> {t.nextStep}</span>}
        {(t.followUpOwnerName || t.followUpDate) && <span className="small"><b>Follow-up:</b> {t.followUpOwnerName ?? '—'}{t.followUpDate ? ` by ${t.followUpDate}` : ''}</span>}
      </>}
      {t.type === 'podcast' && <span className="small"><b>{t.podcastTopic}</b> · consent form {t.podcastConsentSigned ? 'signed' : 'NOT signed'}</span>}
      {t.type === 'demo' && <span className="small"><b>{t.demoName}</b></span>}
      {t.notes && <p className="small">{t.notes}</p>}
      {canEdit && actions}
    </div>
  );
}
