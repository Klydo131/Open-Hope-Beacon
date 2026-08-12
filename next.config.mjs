/** @type {import('next').NextConfig} */

// Security headers.
//
// As shipped there is no backend, so there is nothing here to steal — but the
// headers are set anyway, because these are what a fork inherits on the day it
// does connect one, and nobody adds them later. No clickjacking, no MIME
// sniffing, a tight referrer policy, and a Content-Security-Policy that allows
// this origin and nothing else.
//
// IF YOU CONNECT A BACKEND: add its origin to `connect-src` and nowhere else.
// Widening `default-src` is the usual shortcut and it gives away every other
// directive at the same time.
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Next.js injects small inline bootstrap scripts; 'unsafe-inline' is scoped to
  // scripts we ship. No third-party script origins are allowed.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  // Files the person saved to their own device play from a blob: URL. Without
  // this, media-src falls back to default-src 'self', blob: is not 'self', and
  // every local audio/video file fails to play with no visible error.
  "media-src 'self' blob:",
  // The only third-party frames allowed, and only these: the YouTube and
  // Facebook video players. frame-src otherwise falls back to default-src
  // 'self' and every embed is blocked. Scripts, XHR and everything else stay
  // first-party — this permits an embedded player and nothing more.
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://www.facebook.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// Search visibility, decided in one place. Kept in step with app/robots.ts and
// the `robots` metadata in app/layout.tsx, which read the same variable through
// lib/site-visibility.ts — this file cannot import that module (a .mjs config is
// evaluated before TypeScript exists), so it reads the variable directly and
// tests/security-invariants.mjs asserts the three never drift apart.
//
// Default: no. A church deployment holds real people's names, and a shared deep
// link that gets indexed is the cheapest possible leak, so being findable is
// opted into on purpose. The public showcase is the deployment that sets it.
const indexable = process.env.BEACON_PUBLIC_SITE === '1';

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(indexable ? [] : [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }]),
];

// The build identity deliberately does NOT live here any more.
//
// It used to be `Date.now().toString(36)` in this file, exposed through `env`.
// Next.js evaluates this config more than once, so the browser bundle and the
// server route ended up holding ids from different evaluations. They disagreed
// permanently, the app compared them, and it announced "A new version is ready"
// on every single check, forever, on a perfectly current build.
//
// scripts/stamp-build.mjs now writes lib/build-info.ts once per build and both
// sides import that one constant. See the note in that script.

const nextConfig = {
  reactStrictMode: true,
  // The image optimizer is disabled, and that is a security decision as much as
  // a cost one.
  //
  // Next ships /_next/image whether or not the app uses it, and this app does
  // not: every picture here is a plain <img> or a blob from the device. Leaving
  // the endpoint reachable kept us exposed to GHSA-q8wf-6r8g-63ch (denial of
  // service in the Image Optimization API using SVGs) for a feature nobody
  // calls. Turning it off removes the route and, with it, the runtime need for
  // sharp, which carries its own inherited libvips CVEs.
  //
  // If you do need the optimizer, turn it back on deliberately and read that
  // advisory first — do not flip it because an image looked soft.
  images: { unoptimized: true },
  // Lint is not allowed to fail a build. It runs in CI where a human reads it;
  // here it would mean a stylistic warning could stop a church deploying.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
