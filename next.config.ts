/* Next.js configuration.
 * - /play serves the Pharma Ninja build (public/pharma-ninja.html, made by
 *   `npm run build:game` before every dev/build) with its own security
 *   policy, plus its offline service worker /play-sw.js.
 * - Every other page gets the strict Hub security headers. */
import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const policy = (rules: string[]) => rules.join('; ');

const hubCsp = policy([
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,   // Next.js inline bootstrap; eval only for local dev
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]);

// The game is one self-contained file: inline script and styles, fonts and logo as data: URIs,
// canvas/audio created in the page. It may only talk to this same site (the Hub API).
const gameCsp = policy([
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "frame-src 'self'",            // the registration form, shown inside the game for unregistered badges
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
]);

const common = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
];

const GAME_PATHS = ['/play', '/pharma-ninja.html'];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['exceljs'],
  async rewrites() {
    return [{ source: '/play', destination: '/pharma-ninja.html' }];
  },
  async headers() {
    const perms = { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' };
    return [
      // Hub pages: everything except the game files and /register (below). Never shown inside a frame.
      { source: '/', headers: [...common, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Content-Security-Policy', value: hubCsp }, perms] },
      { source: '/:path((?!play$|play-sw\\.js$|pharma-ninja\\.html$|register$).+)',
        headers: [...common, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Content-Security-Policy', value: hubCsp }, perms] },
      // The registration form may be shown inside Pharma Ninja, but only by this same site.
      { source: '/register', headers: [...common, { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Content-Security-Policy', value: hubCsp.replace("frame-ancestors 'none'", "frame-ancestors 'self'") }, perms] },
      // The game page: its own policy; always revalidated so a new build is picked up
      ...GAME_PATHS.map((source) => ({ source, headers: [...common, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Content-Security-Policy', value: gameCsp },
        { key: 'Cache-Control', value: 'no-cache' }] })),
      // The service worker must never be cached long, or devices would keep an old game
      { source: '/play-sw.js', headers: [...common, { key: 'Cache-Control', value: 'no-cache' },
        { key: 'Service-Worker-Allowed', value: '/play' }] },
    ];
  },
};

export default nextConfig;
