/* Root layout: fonts, global styles, and page metadata shared by every page. */
import type { Metadata, Viewport } from 'next';
import { barlow, barlowCondensed } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'MResult Booth Hub', template: '%s · MResult Booth Hub' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1F1F1F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body>{children}</body>
    </html>
  );
}
