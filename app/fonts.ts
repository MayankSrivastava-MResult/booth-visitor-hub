/* Barlow (body) and Barlow Condensed (headings, buttons), self-hosted from
 * the game's vendored WOFF2 files (SIL OFL). No Google Fonts at runtime. */
import localFont from 'next/font/local';

export const barlow = localFont({
  src: [
    { path: '../pharma-ninja-src/vendor/fonts/barlow-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../pharma-ninja-src/vendor/fonts/barlow-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-body',
  display: 'swap',
});

export const barlowCondensed = localFont({
  src: [
    { path: '../pharma-ninja-src/vendor/fonts/barlow-condensed-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../pharma-ninja-src/vendor/fonts/barlow-condensed-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
});
