// The way in to a meeting, whichever kind it is.
//
// THE GAP: an online meeting had nowhere to put the link to join it. The app
// arranged the time and then left two people to send a Zoom address to each
// other in a message, which is the errand a shared card was meant to remove,
// and the one thing somebody is hunting for in the sixty seconds before a call.
//
// The column was always meant to hold it. Migration 0009 documents `location`
// as "a place for in person, or a joining address for online" -- one field, on
// purpose, so nobody has to pick a category before typing where to meet. The
// write path in lib/live/data.ts then threw the value away whenever the meeting
// was online, so the half the schema described was never reachable.
//
// Kept out of the component so it can be run rather than read. What counts as a
// safe link is a security question, and a security question deserves a test
// that executes the real function.

import { safeHref } from '../linkify.ts';
import type { MeetingMode } from '../types.ts';

/**
 * The joining link for a meeting, or null if there is not one.
 *
 * `safeHref` is the same guard the chat linkifier uses, so a link in a meeting
 * and a link in a message cannot drift apart on what counts as safe. It allows
 * http and https and nothing else, and rejects a URL carrying user info:
 * `https://zoom.us@evil.example/j/123` reads as Zoom to a person and goes
 * somewhere else entirely. lib/url.ts explains why that one matters here in
 * particular -- a Guide misusing their position towards the Explorer they walk
 * with is inside this app's threat model, not outside it.
 *
 * Anything that is not a link comes back null and is shown as plain text. "I
 * will ring you at seven" is a perfectly good answer to "where", and it must
 * not become a button that goes nowhere.
 */
export function joinUrl(mode: MeetingMode, where: string | null | undefined): string | null {
  if (mode !== 'online' || !where) return null;
  return safeHref(where.trim());
}

/**
 * What to call the button, so it is obvious before anybody taps it.
 *
 * Named after the service where it can be told, because "Join the Zoom call" is
 * recognised in a way a bare address never is, and somebody about to be late
 * reads the button rather than the URL. Anything unrecognised gets the honest
 * general wording instead of a guess.
 */
export function joinLabel(href: string): string {
  let host = '';
  try { host = new URL(href).hostname.replace(/^www\./i, ''); } catch { return 'Join the call'; }
  const is = (domain: string) => new RegExp(`(^|\\.)${domain.replace(/\./g, '\\.')}$`, 'i').test(host);

  if (is('zoom.us')) return 'Join the Zoom call';
  if (is('meet.google.com')) return 'Join on Google Meet';
  if (is('teams.microsoft.com') || is('teams.live.com')) return 'Join on Teams';
  if (is('whereby.com')) return 'Join on Whereby';
  if (is('meet.jit.si')) return 'Join on Jitsi';
  if (is('messenger.com') || is('m.me')) return 'Join on Messenger';
  if (is('skype.com')) return 'Join on Skype';
  return 'Join the call';
}
