/* Data (admin): import the organisers' pre-seed list, delete everything for an email
 * (right to erasure), or purge all event data. ?email=X prefills the email to delete. */
import type { Metadata } from 'next';
import { eventCounts, PURGE_PHRASE } from '@/lib/data/erase';
import { requireAdmin } from '@/lib/session';
import DataAdmin from './DataAdmin';
import ImportVisitors from './ImportVisitors';

export const metadata: Metadata = { title: 'Data' };

export default async function DataPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const admin = await requireAdmin();
  const counts = await eventCounts(admin);
  const email = ((await searchParams).email ?? '').trim().toLowerCase().slice(0, 254);
  return (
    <main className="page narrow">
      <h1>Data</h1>
      <ImportVisitors />
      <p className="muted">Deleting is permanent. Download the <a href="/admin/export">Excel export</a> first if you may need the data.</p>
      <DataAdmin counts={counts} initialEmail={email} purgePhrase={PURGE_PHRASE} />
    </main>
  );
}
