/* QR code for the public registration form. Anyone can scan it with a phone
 * camera; it opens <this site>/register (no login needed). The address is taken
 * from the request, so it is always the site you are on (e.g. a custom domain later). */
import QRCode from 'qrcode';

/** Public site address of the current request, e.g. https://booth-visitor-hub.vercel.app */
export function siteOrigin(headers: Headers): string {
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost:3000';
  const proto = headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export const registerUrl = (headers: Headers) => `${siteOrigin(headers)}/register`;

// High error correction ('Q') so a printed code still scans if creased or partly covered.
const OPTS = { errorCorrectionLevel: 'Q' as const, margin: 4, color: { dark: '#1F1F1F', light: '#FFFFFF' } };

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...OPTS, type: 'svg' });
}

/** PNG large enough for an A4 / A3 poster. */
export function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...OPTS, type: 'png', width: 2048 });
}
