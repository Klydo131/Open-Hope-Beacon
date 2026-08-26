'use client';

// The browser's connection to your database, or null when there is none.
//
// RETURNS NULL RATHER THAN THROWING, and that is the whole point. A client that
// throws when the keys are absent means the app cannot start without a
// database, which would quietly kill the promise that you can clone this and
// look at it. Every caller checks for null and falls back to the sample data.
//
// tests/no-backend.js enforces this: a bare `process.env.X!` or a throw on a
// missing key fails the build.

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { IS_LIVE } from '@/lib/mode';

let cached: SupabaseClient<any> | null = null;
let authCached: SupabaseClient<any> | null = null;

function authStorageKey() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  try {
    const projectRef = new URL(url).hostname.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : '';
  } catch {
    return '';
  }
}

export function saveBrowserSession(session: Session) {
  const key = authStorageKey();
  if (typeof window === 'undefined' || !key) {
    throw new Error('The live session store is unavailable.');
  }
  const encoded = JSON.stringify(session);
  window.localStorage.setItem(key, encoded);
  if (window.localStorage.getItem(key) !== encoded) {
    throw new Error('The live session could not be saved.');
  }
}

export function readBrowserSession(): Session | null {
  const key = authStorageKey();
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (
      typeof session.access_token !== 'string' ||
      typeof session.refresh_token !== 'string' ||
      typeof session.user?.id !== 'string'
    ) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearBrowserSession() {
  const key = authStorageKey();
  if (typeof window !== 'undefined' && key) window.localStorage.removeItem(key);
}

// ---------------------------------------------------------------------------
// STAYING SIGNED IN.
// ---------------------------------------------------------------------------
//
// THE BUG THIS EXISTS FOR: "Your account is not ready. JWT expired."
//
// An access token from Supabase lasts ONE HOUR. A refresh token lasts months
// and is what turns a one-hour token into staying signed in until you sign
// out, which is how every app people are used to behaves.
//
// Nothing here ever used the refresh token. The data client was built with
// `accessToken: () => readBrowserSession()?.access_token`, and passing that
// option switches OFF the library's own session management entirely: it stops
// refreshing, stops scheduling, and simply calls that function. The function
// returned whatever was written to storage at sign-in. So exactly one hour
// later every request began failing, and the app told the person their account
// was not ready, which is not what had happened and not something they could
// act on.
//
// THE EXPIRY IS READ FROM THE TOKEN, NOT FROM THE STORED FIELD. `expires_at`
// is written by whatever produced the session, and ours comes from a custom
// sign-in route; the `exp` claim inside the token is the only copy the server
// will actually enforce. Reading the authority rather than the annotation is
// the difference between refreshing at the right moment and being sure you did.
//
// ONE REFRESH AT A TIME, SHARED. A page load fires several requests at once.
// Supabase ROTATES the refresh token on every use, so two concurrent refreshes
// race: the second presents a token the first has already spent, is refused,
// and the person is signed out by the very code meant to keep them in. The
// in-flight promise is what makes that impossible.

/** Seconds of headroom, so a token never expires mid-request. */
const REFRESH_MARGIN_SECONDS = 120;

/** The `exp` claim, in seconds since the epoch, or 0 when it cannot be read. */
function tokenExpiry(accessToken: string): number {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return 0;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === 'number' ? exp : 0;
  } catch {
    // Unreadable means "treat as expired": refreshing an unexpired token costs
    // one request, while trusting an expired one signs somebody out.
    return 0;
  }
}

let refreshing: Promise<Session | null> | null = null;

/**
 * Trade the refresh token for a new session, at most once at a time.
 *
 * Called directly rather than through a second client, because a client
 * configured to persist would write this same storage key in ITS OWN format,
 * and readBrowserSession above expects plain JSON. Two writers, two formats,
 * one key is a signed-out member on the day the library changes its encoding.
 */
function refreshBrowserSession(session: Session): Promise<Session | null> {
  if (refreshing) return refreshing;

  refreshing = (async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !key) return null;
    try {
      const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!res.ok) {
        // A refused refresh means the session is genuinely over: signed out
        // elsewhere, or the account removed. Clearing it is what turns the
        // next page load into the sign-in screen rather than a loop.
        if (res.status === 400 || res.status === 401) clearBrowserSession();
        return null;
      }
      const next = (await res.json()) as Session | null;
      if (!next || typeof next.access_token !== 'string'
          || typeof next.refresh_token !== 'string') return null;
      // Keep the user object when the refresh response omits it, so nothing
      // downstream that reads session.user.id starts finding undefined.
      const merged = { ...session, ...next } as Session;
      saveBrowserSession(merged);
      return merged;
    } catch {
      // Offline. NOT a sign-out: the token may be perfectly valid and the
      // request simply could not leave the device.
      return null;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

/**
 * A token that will still be valid when the request lands, refreshing first if
 * it will not be. This is what the data client asks for before every call.
 */
export async function liveAccessToken(): Promise<string | null> {
  const session = readBrowserSession();
  if (!session) return null;

  const now = Math.floor(Date.now() / 1000);
  if (tokenExpiry(session.access_token) - now > REFRESH_MARGIN_SECONDS) {
    return session.access_token;
  }
  const fresh = await refreshBrowserSession(session);
  // On a failed refresh return the old token rather than null. If the failure
  // was the network, the token may still work; if it really has expired, the
  // request fails the same way it would have anyway. Returning null instead
  // reads to every caller as "signed out", which is a worse guess.
  return fresh?.access_token ?? session.access_token;
}

export function supabase() {
  if (!IS_LIVE) return null;
  if (cached) return cached;
  // Data calls use the already-verified first-party session directly. This
  // prevents privacy shields from turning an unnecessary second Auth request
  // into a false "not signed in" result after a successful gateway login.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  cached = createClient<any>(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    // Refreshes when needed. See liveAccessToken: handing over the STORED
    // token is what expired every session after exactly one hour.
    { accessToken: liveAccessToken },
  );
  return cached;
}

export function supabaseAuth() {
  if (!IS_LIVE) return null;
  if (authCached) return authCached;
  authCached = createClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { auth: { storageKey: authStorageKey() } },
  );
  return authCached;
}
