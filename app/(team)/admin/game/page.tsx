/* Game content admin: Pharma Ninja's domains and questions, CSV import/export,
 * and "delete all TEST questions". Devices pick up changes within 5 minutes
 * (or at once with "Refresh content now" in the game's admin panel). */
import type { Metadata } from 'next';
import { countTestQuestions, listDomains, listQuestions } from '@/lib/data/content';
import { requireAdmin } from '@/lib/session';
import CsvTools from './CsvTools';
import DomainsAdmin from './DomainsAdmin';
import QuestionsAdmin from './QuestionsAdmin';

export const metadata: Metadata = { title: 'Game content' };

export default async function GamePage() {
  const admin = await requireAdmin();
  const [domains, questions, testCount] = await Promise.all([listDomains(admin), listQuestions(admin), countTestQuestions(admin)]);
  const enabledReady = domains.filter((d) => d.enabled && d.enabledQuestionCount > 0).length;
  return (
    <main className="page">
      <h1>Game content</h1>
      <p className="muted">
        {domains.length} domains ({enabledReady} playable) · {questions.length} questions ({questions.filter((q) => q.enabled).length} enabled).
        Game devices pick up changes within 5 minutes, or straight away with &ldquo;Refresh content now&rdquo; in the game&rsquo;s admin panel.
        Aim for at least 20 enabled questions per domain: a round ends when a domain runs out.
      </p>
      <DomainsAdmin domains={domains} />
      <QuestionsAdmin domains={domains.map((d) => ({ id: d.id, name: d.name, accent: d.accent }))} questions={questions} />
      <CsvTools testCount={testCount} />
    </main>
  );
}
