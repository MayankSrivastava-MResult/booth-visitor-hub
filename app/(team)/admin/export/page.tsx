/* Excel export (admin): one click for everything, or pick IST dates. */
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/session';
import { istDate } from '@/lib/time';

export const metadata: Metadata = { title: 'Export' };

export default async function ExportPage() {
  await requireAdmin();
  const today = istDate();
  return (
    <main className="page narrow">
      <h1>Excel export</h1>
      <div className="card">
        <a className="btn block" href="/api/admin/export">Download everything (.xlsx)</a>
        <p className="small muted">Sheets: Visitors, Conversations, Podcast guests, Demos, Other notes, Game rounds, Game plays,
          Unmatched badge IDs. Times are in IST.</p>
      </div>
      <form className="card" action="/api/admin/export" method="get">
        <h2>Only some days</h2>
        <div className="grid-2 stack">
          <label className="field">From <input type="date" name="from" defaultValue={today} /></label>
          <label className="field">To <input type="date" name="to" defaultValue={today} /></label>
        </div>
        <p className="small muted">IST calendar days, inclusive. Visitors are included if they registered or had any touchpoint in the range.</p>
        <button className="btn ghost" type="submit">Download for these dates</button>
      </form>
    </main>
  );
}
