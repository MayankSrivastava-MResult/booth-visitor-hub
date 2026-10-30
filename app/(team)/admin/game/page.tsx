/* Game settings admin: the pill fall speed, Pharma Ninja's domains and questions,
 * CSV import/export, and "delete all TEST questions". Devices pick up changes within
 * 5 minutes (or at once with "Refresh content now" in the game's admin panel). */
import type { Metadata } from 'next';
import { countTestQuestions, getFallSpeed, listDomains, listQuestions } from '@/lib/data/content';
import { requireAdmin } from '@/lib/session';
import CsvTools from './CsvTools';
import DomainsAdmin from './DomainsAdmin';
import FallSpeed from './FallSpeed';
import QuestionsAdmin from './QuestionsAdmin';

export const metadata: Metadata = { title: 'Game settings' };

export default async function GamePage() {
  const admin = await requireAdmin();
  const [domains, questions, testCount, fallSpeed] = await Promise.all([listDomains(admin), listQuestions(admin), countTestQuestions(admin), getFallSpeed(admin)]);
  const enabledReady = domains.filter((d) => d.enabled && d.enabledQuestionCount > 0).length;
  return (
    <main className="page">
      <h1>Game settings</h1>
      <p className="muted">
        {domains.length} domains ({enabledReady} playable) · {questions.length} questions ({questions.filter((q) => q.enabled).length} enabled).
        Game devices pick up changes within 5 minutes, or straight away with &ldquo;Refresh content now&rdquo; in the game&rsquo;s admin panel.
        Each round climbs 5 Easy → 5 Moderate → Difficult, so every domain needs at least 5 enabled Easy and 5 Moderate questions.
      </p>
      <FallSpeed initial={fallSpeed} />
      <DomainsAdmin domains={domains} />
      <QuestionsAdmin domains={domains.map((d) => ({ id: d.id, name: d.name, accent: d.accent }))} questions={questions} />
      <CsvTools testCount={testCount} />
    </main>
  );
}
