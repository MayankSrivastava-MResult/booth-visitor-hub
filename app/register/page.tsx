/* PUBLIC visitor registration, reached by the QR code at the booth.
 * No login. Shows the current consent notice from settings. */
import type { Metadata } from 'next';
import RegisterForm from '@/components/RegisterForm';
import { getRegistrationConfig } from '@/lib/data/visitors';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Register' };

export default async function RegisterPage() {
  const cfg = await getRegistrationConfig();
  return (
    <>
      <header className="pub-head">
        <div className="pub-head-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mresult-logo-reversed.png" alt="MResult" width={142} height={28} />
          <h1>Welcome to MResult</h1>
          <p>Global Pharma Partnering Summit 2026 · Booth G1. Register once with your badge ID. It takes under a minute.</p>
        </div>
      </header>
      <main className="page narrow">
        <RegisterForm mode="public"
          cfg={{ consentVersion: cfg.consentVersion, noticeText: cfg.noticeText, marketingText: cfg.marketingText, badgeHint: cfg.badgeHint }} />
      </main>
    </>
  );
}
