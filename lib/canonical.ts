'use client';

import { CANONICAL_HOST, BUILD_ENV } from './build-info';

// The one address that is safe to give to another person.
//
// This exists because of how the app got installed twice. Most hosts give every
// preview — and often every individual deployment — its own hostname, and to a
// browser a different hostname is a different application: its own icon, its own
// service worker, its own storage. A copy installed from one of those addresses
// can never receive a production update, and there is no way to migrate it: the
// person has to uninstall and install again, which is the exact thing the whole
// update system exists to prevent.
//
// The dangerous version of that is not one person with two icons. It is sharing.
// Paste whatever address happens to be in the bar, send it to a congregation, and
// every one of them installs a copy that is frozen at the moment it was shared.
// So sharing never uses the current location. It uses this.
//
// CANONICAL_HOST comes from scripts/stamp-build.mjs, which reads it from the
// host's environment or from a CANONICAL_HOST you set yourself. When it is
// unknown — a local build, or a host nobody has taught that script about — this
// returns the current origin, which is the honest answer rather than a guess
// that could be wrong.

/** The production address for this app, with an optional path. */
export function canonicalUrl(path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (CANONICAL_HOST) return `https://${CANONICAL_HOST}${clean}`;
  if (typeof window !== 'undefined') return `${window.location.origin}${clean}`;
  return clean;
}

/** True when the page is being served from somewhere that is not production. */
export function onCanonicalHost(): boolean {
  if (typeof window === 'undefined') return true;
  if (BUILD_ENV === 'preview') return false;
  if (!CANONICAL_HOST) return true; // nothing to compare against; do not cry wolf
  return window.location.host === CANONICAL_HOST;
}
