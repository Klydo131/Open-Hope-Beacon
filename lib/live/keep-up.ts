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
export const KEEP_UP_STUDIES = ['lesson_series', 'lessons', 'lesson_files', 'lesson_reads'] as const;
export const KEEP_UP_LIBRARY = ['materials', 'material_shares'] as const;
export const KEEP_UP_MEETINGS = ['meetings'] as const;
export const KEEP_UP_PEOPLE = ['profiles', 'pairings', 'pairing_requests', 'invites', 'recommendations'] as const;
export const KEEP_UP_BELL = ['notifications'] as const;
export const KEEP_UP_GUILD = ['guild_activity_posts', 'guild_activity_amens'] as const;

// ---------------------------------------------------------------------------
// THE ROOMS THAT WERE LEFT OUT.
// ---------------------------------------------------------------------------
//
// Reported as "most users complain that they need to refresh their browser to
// get the real time results". Sixteen components loaded data and subscribed to
// nothing -- including all three of the screens a person actually lives on: the
// Explorer's, the Guide's and the Director's. The hook and the publication had
// been right since 20260902020000; they were simply never called from most of
// the app, and a mechanism nobody calls is indistinguishable from one that does
// not work.
//
// Migration 20260908170000 publishes the tables these sets name.

/**
 * One relationship, as seen from either end.
 *
 * The messages themselves keep their own, narrower subscription filtered to a
 * single pairing -- a conversation is the busiest thing here and does not want
 * a whole-screen reload per keystroke elsewhere. This covers everything AROUND
 * the conversation: the pairing itself, the files sent into it, and the other
 * person's name and photograph.
 */
export const KEEP_UP_MY_PAIRING = ['pairings', 'pairing_media', 'profiles'] as const;

/**
 * Follow-ups and names put forward: the Guide's working list.
 *
 * `seeker_notes` is NOT here. A Guide's private notes on the person they walk
 * with are not published, by the same rule that keeps safeguarding off the
 * wire -- see the migration. The list still refreshes when a follow-up or a
 * recommendation moves, which is what a Guide is actually watching for.
 */
export const KEEP_UP_FOLLOW_UPS =
  ['follow_ups', 'recommendations', 'lesson_series'] as const;

/** A Director's roster: who is waiting, who is approved, who walks with whom. */
export const KEEP_UP_ROSTER =
  ['profiles', 'pairings', 'pairing_requests', 'invites', 'recommendations', 'churches'] as const;

/** The guilds and who is in them. */
export const KEEP_UP_GUILDS = ['guilds', 'guild_members', 'profiles', 'pairings'] as const;

/**
 * Safeguarding. A report arriving is the one thing that should never wait.
 *
 * Published by 20260909100000, on the owner's decision, after being left off
 * deliberately for a day. The read policy is an approved admin or executive of
 * that church and nothing wider, and realtime evaluates it per subscriber -- so
 * this changes when a Director finds out, never who may find out.
 */
export const KEEP_UP_REPORTS = ['reports', 'report_files', 'profiles'] as const;

/**
 * The Cases room, where several people are in the same hearing at once.
 *
 * The one screen in this app where two people are expected to be typing into
 * the same record at the same moment, which makes a stale view worse here than
 * anywhere else. `trials_read` is `in_trial(id)`: a party to that hearing, and
 * nobody else, however the row reaches them.
 */
export const KEEP_UP_CASES =
  ['trials', 'trial_statements', 'trial_parties', 'discipline_log', 'profiles'] as const;

// NO SET FOR THE SECURITY AUDIT, and none for a Guide's private notes. Neither
// was part of what was asked for, both still reload, and both are named in
// tests/every-room-keeps-up.mjs so they read as a decision rather than a gap.

/** The Guides' room: their thread, and the requests waiting in it. */
export const KEEP_UP_GUIDE_ROOM =
  ['guide_room_messages', 'pairing_requests', 'profiles', 'pairings'] as const;

/** The feedback inbox a Director works from. */
export const KEEP_UP_FEEDBACK = ['feedback'] as const;

/** The library's record, and who has been stopped from adding to it. */
export const KEEP_UP_LIBRARY_RECORD = ['library_activity', 'library_blocks'] as const;

/** Somebody's own account: their name, their photograph, their church. */
export const KEEP_UP_ACCOUNT = ['profiles', 'churches', 'profile_changes'] as const;

/** The numbers. Everything they are counted from. */
export const KEEP_UP_NUMBERS =
  ['profiles', 'pairings', 'meetings', 'materials', 'prayer_requests', 'journey_events'] as const;
