/* Staff-assisted registration: the public form, opened by a signed-in team
 * member (e.g. on a booth tablet). The record stores who registered it.
 * ?badge=X prefills the badge; ?continue=/log returns there afterwards. */
import type { Metadata } from 'next';
import RegisterForm from '@/components/RegisterForm';
import { getSettings } from '@/lib/data/team';
import { requireUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Register visitor' };

export default async function StaffRegisterPage({ searchParams }: { searchParams: Promise<{ badge?: string; continue?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const cfg = await getSettings(user);
  const continueTo = sp.continue === '/log' ? '/log' : undefined;
  return (
    <main className="page narrow">
      <h1>Register a visitor</h1>
      <p className="muted">Fill this in with the visitor. It is recorded as registered by {user.displayName}.</p>
      <RegisterForm mode="staff" initialBadge={(sp.badge ?? '').slice(0, 64)} continueTo={continueTo}
        cfg={{ consentVersion: cfg.consentVersion, noticeText: cfg.noticeText, marketingText: cfg.marketingText, badgeHint: cfg.badgeHint }} />
    </main>
  );
}
