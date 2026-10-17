/* Podcast producer view: the day's podcast guests (IST), so the daily guest
 * list fills itself. ?date=YYYY-MM-DD shows another day. */
import type { Metadata } from 'next';
import Link from 'next/link';
import { podcastGuests } from '@/lib/data/interactions';
import { requireUser } from '@/lib/session';
import { formatIst, formatIstDay, istDate } from '@/lib/time';
import { isoDate } from '@/lib/validation';

export const metadata: Metadata = { title: 'Podcast guests' };

export default async function PodcastPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = istDate();
  const day = isoDate.safeParse(sp.date).success ? sp.date! : today;
  const guests = await podcastGuests(user, day);
  return (
    <main className="page">
      <div className="spread">
        <h1>Podcast guests</h1>
        <form className="row" action="/podcast">
          <input type="date" name="date" defaultValue={day} style={{ width: 'auto' }} />
          <button className="btn small" type="submit">Show</button>
        </form>
      </div>
      <p className="muted">{formatIstDay(day)}{day === today ? ' (today)' : ''} · {guests.length} guest{guests.length === 1 ? '' : 's'}</p>
      <div className="card">
        {guests.length === 0 ? <p className="muted">No podcast guests logged for this day.</p> : (
          <div className="list">
            {guests.map((g) => (
              <div key={g.id} className="stack" style={{ gap: 4 }}>
                <div className="spread">
                  <Link href={`/visitors/${encodeURIComponent(g.badgeId)}`} className="item-title">{g.fullName}</Link>
                  <span className="small muted">{formatIst(g.at)}</span>
                </div>
                <span>{g.jobTitle} · {g.company}</span>
                {g.linkedinUrl && <a className="small" href={g.linkedinUrl} target="_blank" rel="noopener noreferrer">{g.linkedinUrl.replace(/^https:\/\/(www\.)?/, '')}</a>}
                <span className="small"><b>{g.topic}</b> · consent form {g.consentSigned ? 'signed' : <b>NOT signed</b>} · logged by {g.loggedBy}</span>
                {g.notes && <span className="small muted">{g.notes}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
