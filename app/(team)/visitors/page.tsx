/* Visitor search: by badge ID, name, company or email. Newest first. */
import type { Metadata } from 'next';
import Link from 'next/link';
import { searchVisitors } from '@/lib/data/visitors';
import { requireUser } from '@/lib/session';
import { formatIst } from '@/lib/time';

export const metadata: Metadata = { title: 'Visitors' };

export default async function VisitorsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = ((await searchParams).q ?? '').slice(0, 100);
  const items = await searchVisitors(user, q, 100);
  return (
    <main className="page">
      <h1>Visitors</h1>
      <form className="row" action="/visitors" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Badge ID, name, company or email" style={{ flex: 1, minWidth: 0 }} />
        <button className="btn" type="submit">Search</button>
      </form>
      <div className="card">
        <p className="small muted">{q ? `${items.length} match${items.length === 1 ? '' : 'es'}` : `Latest ${items.length} registrations`}</p>
        {items.length === 0 ? <p className="muted">No visitors found.</p> : (
          <div className="list">
            {items.map((v) => (
              <Link key={v.badgeId} href={`/visitors/${encodeURIComponent(v.badgeId)}`} className="spread">
                <span className="stack" style={{ gap: 0 }}>
                  <span className="item-title">{v.fullName}</span>
                  <span className="small muted">{v.jobTitle} · {v.company}</span>
                </span>
                <span className="small muted" style={{ textAlign: 'right' }}>{v.badgeId}<br />{formatIst(v.createdAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
