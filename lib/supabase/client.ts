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
    { accessToken: async () => readBrowserSession()?.access_token ?? null },
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
