/* Log interaction. ?visitor=<id> preselects that visitor (e.g. after registering a walk-in). */
import type { Metadata } from 'next';
import InteractionForm from '@/components/InteractionForm';
import { domainTagOptions, getSettings, listTeam } from '@/lib/data/team';
import { requireUser } from '@/lib/session';
import { isUuid } from '@/lib/validation';

export const metadata: Metadata = { title: 'Log interaction' };

export default async function LogPage({ searchParams }: { searchParams: Promise<{ visitor?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [team, settings, domainTags] = await Promise.all([listTeam(user, { peopleOnly: true }), getSettings(user), domainTagOptions(user)]);
  return (
    <main className="page narrow">
      <h1>Log interaction</h1>
      <InteractionForm
        me={{ id: user.id, displayName: user.displayName }}
        team={team.map((t) => ({ id: t.id, displayName: t.displayName }))}
        lists={{ podcastTopics: settings.podcastTopics, demos: settings.demos, domainTags }}
        initialVisitorId={sp.visitor && isUuid(sp.visitor) ? sp.visitor : ''} />
    </main>
  );
}
