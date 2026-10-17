/* PUBLIC visitor registration, reached by the QR code at the booth. No login.
 * Shows the current consent notice from settings.
 * ?kiosk=1&badge=X: opened inside Pharma Ninja when a player's badge is not registered
 * (badge prefilled; on save the game continues with the player's first name). */
import type { Metadata } from 'next';
import RegisterForm from '@/components/RegisterForm';
import { getRegistrationConfig } from '@/lib/data/visitors';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Register' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ kiosk?: string; badge?: string }> }) {
  const sp = await searchParams;
  const kiosk = sp.kiosk === '1';
  const badge = (sp.badge ?? '').trim().toUpperCase().slice(0, 64);
  const cfg = await getRegistrationConfig();
  return (
    <>
      <header className="pub-head">
        <div className="pub-head-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mresult-logo-reversed.png" alt="MResult" width={142} height={28} />
          <h1>{kiosk ? 'Register to play Pharma Ninja' : 'Welcome to MResult'}</h1>
          <p>{kiosk
            ? 'Your badge ID isn’t registered yet. Fill this in once (under a minute) and you go straight back to the game.'
            : 'Global Pharma Partnering Summit 2026 · Booth G1. Register once with your badge ID. It takes under a minute.'}</p>
        </div>
      </header>
      <main className="page narrow">
        <RegisterForm mode="public" kiosk={kiosk} initialBadge={badge}
          cfg={{ consentVersion: cfg.consentVersion, noticeText: cfg.noticeText, marketingText: cfg.marketingText, badgeHint: cfg.badgeHint }} />
      </main>
    </>
  );
}
