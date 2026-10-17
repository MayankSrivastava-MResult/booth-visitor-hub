/* Data (admin): delete one visitor (right to erasure) or purge all event data.
 * ?badge=X prefills the visitor to delete (linked from the visitor page). */
import type { Metadata } from 'next';
import { eventCounts, PURGE_PHRASE } from '@/lib/data/erase';
import { requireAdmin } from '@/lib/session';
import DataAdmin from './DataAdmin';

export const metadata: Metadata = { title: 'Data' };

export default async function DataPage({ searchParams }: { searchParams: Promise<{ badge?: string }> }) {
  const admin = await requireAdmin();
  const counts = await eventCounts(admin);
  const badge = ((await searchParams).badge ?? '').trim().toUpperCase().slice(0, 64);
  return (
    <main className="page narrow">
      <h1>Data</h1>
      <p className="muted">Both actions are permanent. Download the <a href="/admin/export">Excel export</a> first if you may need the data.</p>
      <DataAdmin counts={counts} initialBadge={badge} purgePhrase={PURGE_PHRASE} />
    </main>
  );
}
