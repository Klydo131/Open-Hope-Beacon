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

export function supabase() {
  if (!IS_LIVE) return null;
  if (cached) return cached;
  // This is a client-only app, so the durable browser store is the source of
  // truth for its session. The same-origin sign-in gateway hands the verified
  // session to this client before any navigation occurs.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  cached = createClient<any>(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    { auth: { storageKey: authStorageKey() } },
  );
  return cached;
}
