/* Registration QR code: print it for the booth, download it for a poster, or show
 * it on screen for a visitor to scan. Scanning opens the public form at /register. */
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { qrSvg, registerUrl } from '@/lib/qr';
import { requireUser } from '@/lib/session';
import PrintButton from './PrintButton';

export const metadata: Metadata = { title: 'Registration QR code' };

export default async function QrPage() {
  await requireUser();
  const url = registerUrl(await headers());
  const svg = await qrSvg(url);
  return (
    <main className="page narrow">
      <div className="no-print stack">
        <h1>Registration QR code</h1>
        <p className="muted">Visitors scan this with their phone camera and the registration form opens. No login or app needed.
          Print it for the booth, or show this page to a visitor.</p>
        <div className="row">
          <PrintButton />
          <a className="btn ghost" href="/api/qr?format=png">Download PNG</a>
          <a className="btn ghost" href="/api/qr?format=svg">Download SVG (for print)</a>
        </div>
      </div>
      <div className="card qr-poster">
        <h2>Register with MResult</h2>
        <p>Scan with your phone camera. It takes under a minute.</p>
        <div className="qr-img" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="small muted">{url.replace(/^https?:\/\//, '')}</p>
        <p className="small">Booth G1 · Global Pharma Partnering Summit 2026</p>
      </div>
    </main>
  );
}
