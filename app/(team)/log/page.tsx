/* Log interaction. ?badge=X prefills the badge (e.g. after registering a walk-in). */
import type { Metadata } from 'next';
import InteractionForm from '@/components/InteractionForm';
import { domainTagOptions, getSettings, listTeam } from '@/lib/data/team';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Log interaction' };

export default async function LogPage({ searchParams }: { searchParams: Promise<{ badge?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [team, settings, domainTags] = await Promise.all([listTeam(user, { activeOnly: true }), getSettings(user), domainTagOptions(user)]);
  return (
    <main className="page narrow">
      <h1>Log interaction</h1>
      <InteractionForm
        me={{ id: user.id, displayName: user.displayName }}
        team={team.map((t) => ({ id: t.id, displayName: t.displayName }))}
        lists={{ podcastTopics: settings.podcastTopics, demos: settings.demos, domainTags }}
        initialBadge={(sp.badge ?? '').toUpperCase().slice(0, 64)} />
    </main>
  );
}
