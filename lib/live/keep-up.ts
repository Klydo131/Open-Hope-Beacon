'use client';

// The screen keeps up on its own.
//
// WHAT THIS FIXES. One table in the whole app was published for realtime —
// `messages` — so a conversation updated itself and every other screen did not.
// Post a notice, approve somebody, add a study, share a resource, propose a
// time: the person looking at that screen saw the old version until they pulled
// to refresh. In front of a room that reads as the app being broken, and there
// is no way to explain it that sounds like anything else.
//
// Migration 20260902020000 publishes the tables. This is the other half.
//
// RLS DECIDES, NOT THIS FILE. Realtime evaluates the same policies as a SELECT,
// per subscriber, so an event only arrives for a row this person could already
// have read. Nothing here filters for privacy, and nothing here could: a filter
// in the browser is a courtesy to the network, never a boundary.
//
// WHY IT RELOADS RATHER THAN PATCHING THE ROW IN PLACE. Patching means writing
// a second copy of every screen's merge logic, in the component, where a
// mistake shows up as a list that is subtly wrong and stays wrong. Re-running
// the load the screen already has is one line, cannot drift from the real
// query, and on a church-sized table costs a request nobody notices. If a
// screen ever grows too big for that, it can subscribe more precisely; none is
// close.

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';

/** How long to wait before reloading, so a burst of writes costs one request. */
const SETTLE_MS = 250;

/**
 * Re-run `reload` whenever any of `tables` changes.
 *
 * `tables` is read once per mount and must not be rebuilt on every render — pass
 * a module-level constant, not an inline array, or the effect tears the channel
 * down and builds it again on every keystroke elsewhere on the page.
 */
export function useKeepUp(
  tables: readonly string[],
  reload: () => void | Promise<void>,
  enabled = true,
): void {
  // The newest reload, without making it a dependency. A component that rebuilds
  // its loader every render would otherwise resubscribe every render.
  const latest = useRef(reload);
  latest.current = reload;

  const key = tables.join(',');

  useEffect(() => {
    if (!enabled || !key) return;
    const client = supabase();
    if (!client) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    // A burst — approving five people, a bulk invite — is one reload, not five.
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { void latest.current(); }, SETTLE_MS);
    };

    // One channel for the whole hook. A channel per table would open twenty
    // sockets on a screen that watches twenty tables.
    const channel = client.channel(`keep-up:${key}:${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, settle);
    }
    channel.subscribe();

    return () => {
      clearTimeout(timer);
      client.removeChannel(channel);
    };
  }, [key, enabled]);
}

// The sets each screen watches. Module-level constants on purpose: see the note
// on `tables` above — an inline array is a new array every render.
export const KEEP_UP_CHURCH = ['announcements', 'blog_posts', 'prayer_requests'] as const;
export const KEEP_UP_NOTICES = ['announcements'] as const;
export const KEEP_UP_PRAYER = ['prayer_requests'] as const;
export const KEEP_UP_BLOG = ['blog_posts'] as const;
export const KEEP_UP_STUDIES = ['lesson_series', 'lessons', 'lesson_files'] as const;
export const KEEP_UP_LIBRARY = ['materials', 'material_shares'] as const;
export const KEEP_UP_MEETINGS = ['meetings'] as const;
export const KEEP_UP_PEOPLE = ['profiles', 'pairings', 'pairing_requests', 'invites', 'recommendations'] as const;
export const KEEP_UP_BELL = ['notifications'] as const;
export const KEEP_UP_GUILD = ['guild_activity_posts', 'guild_activity_amens'] as const;
