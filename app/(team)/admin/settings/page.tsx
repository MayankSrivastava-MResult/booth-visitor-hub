/* Settings (admin): badge ID rule, consent notice text, podcast topics, demo list. */
import type { Metadata } from 'next';
import { getSettings } from '@/lib/data/team';
import { requireAdmin } from '@/lib/session';
import SettingsForm from './SettingsForm';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const s = await getSettings(admin);
  return (
    <main className="page narrow">
      <h1>Settings</h1>
      <SettingsForm initial={s} />
    </main>
  );
}
