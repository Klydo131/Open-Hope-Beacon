import type { MetadataRoute } from 'next';

// Disallow every crawler from every path — the deliberate default.
//
// A church deployment holds real people's names and conversations, and a shared
// deep link that gets indexed is the cheapest possible leak. So being findable
// has to be opted into on purpose, not out of by accident.
//
// If your deployment genuinely should be public, change this AND the `robots`
// block in app/layout.tsx AND the X-Robots-Tag header in next.config.mjs. All
// three, or none — a half-change is how a page ends up indexed while everybody
// believes it is not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
