/* Team (admin): who can sign in. Add a person with email, name, role and a
 * password you give them; change role; reset password; remove. */
import type { Metadata } from 'next';
import { listTeam } from '@/lib/data/team';
import { requireAdmin } from '@/lib/session';
import TeamAdmin from './TeamAdmin';

export const metadata: Metadata = { title: 'Team' };

export default async function UsersPage() {
  const admin = await requireAdmin();
  const team = await listTeam(admin);
  return (
    <main className="page">
      <h1>Team</h1>
      <p className="muted">People on this list can sign in with their email and the password you set. Removing someone, changing their role
        or resetting their password signs them out straight away.</p>
      <TeamAdmin team={team} meId={admin.id} />
    </main>
  );
}
