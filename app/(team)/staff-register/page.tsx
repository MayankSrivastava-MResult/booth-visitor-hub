/* Staff-assisted registration: the public form, opened by a signed-in team
 * member (e.g. on a booth tablet). The record stores who registered it.
 * ?email=X or ?name=X prefills that field; ?continue=/log returns there afterwards.
 * ?complete=<visitor id> completes a pre-seeded visitor's registration (details prefilled). */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import RegisterForm from '@/components/RegisterForm';
import { getSettings } from '@/lib/data/team';
import { visitorDetail } from '@/lib/data/visitors';
import { requireUser } from '@/lib/session';
import { isUuid } from '@/lib/validation';

export const metadata: Metadata = { title: 'Register visitor' };

export default async function StaffRegisterPage({ searchParams }:
  { searchParams: Promise<{ email?: string; name?: string; continue?: string; complete?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const cfg = await getSettings(user);
  const continueTo = sp.continue === '/log' ? '/log' : undefined;
  const formCfg = { consentVersion: cfg.consentVersion, noticeText: cfg.noticeText, marketingText: cfg.marketingText };

  if (sp.complete) {
    const d = isUuid(sp.complete) ? await visitorDetail(user, sp.complete) : null;
    if (!d) notFound();
    const v = d.visitor;
    return (
      <main className="page narrow">
        <h1>Complete registration</h1>
        <p className="muted">{v.fullName} is on the organisers&rsquo; list. Check the details with them, add their email if they
          want to, and ask them to read and agree to the notice. It is recorded as completed by {user.displayName}.</p>
        <RegisterForm mode="staff" cfg={formCfg} complete={{ id: v.id, values: {
          fullName: v.fullName, company: v.company, jobTitle: v.jobTitle ?? '', email: v.email ?? '',
          mobile: v.mobile ?? '', linkedinUrl: v.linkedinUrl ?? '' } }} />
      </main>
    );
  }
  return (
    <main className="page narrow">
      <h1>Register a visitor</h1>
      <p className="muted">Fill this in with the visitor. It is recorded as registered by {user.displayName}.</p>
      <RegisterForm mode="staff" initialEmail={(sp.email ?? '').trim().toLowerCase().slice(0, 254)}
        initialName={(sp.name ?? '').trim().slice(0, 120)} continueTo={continueTo} cfg={formCfg} />
    </main>
  );
}
