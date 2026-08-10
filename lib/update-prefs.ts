'use client';

// Update reminders: on by default, snoozeable, and switchable off.
//
// The first design of this was a screen you could not dismiss. That was the
// wrong instinct. A wall stops the one person who is mid-sentence in a prayer
// request just as surely as it stops the person who has been ignoring updates
// for a month, and it strands anybody whose signal drops at the wrong moment.
// The owner asked for a nag instead: remind people, keep reminding them, and
// let them turn it off.
//
// So this is the whole policy, in one place:
//
//   - Reminders are ON unless the person has switched them off. Absent means on,
//     which is what makes "on by default" survive a cleared browser.
//   - "Later" is a snooze, not a dismissal. It comes back.
//   - A build old enough to matter comes back sooner and says more.
//   - Off means off. No banner, ever. Settings still tells the truth, and still
//     has the buttons, because turning off the reminder is not the same as
//     saying you never want to update.
//
// Everything is per device and per browser profile, in localStorage. There is no
// account setting for this: the thing being decided is how one phone behaves.

const REMIND_KEY = 'beacon.update.remind';
const SNOOZE_KEY = 'beacon.update.snooze';

/** How long "Later" lasts, by how much it matters. */
export const SNOOZE_MS = {
  /** A newer build exists. Worth knowing, not urgent. */
  ready: 8 * 60 * 60 * 1000,
  /** Older than the build the server still supports. Ask again sooner. */
  required: 60 * 60 * 1000,
} as const;

function read(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    // Private browsing, a full quota, a locked-down webview. Never throw here:
    // this is a preference, and losing one must not take a screen down with it.
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (typeof window === 'undefined') return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Same reasoning. The reminder simply reverts to the default.
  }
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

/** Subscribe to preference changes. Returns an unsubscribe function. */
export function onUpdatePrefsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** True unless this device has explicitly opted out. */
export function remindersOn(): boolean {
  return read(REMIND_KEY) !== 'off';
}

export function setRemindersOn(on: boolean) {
  write(REMIND_KEY, on ? null : 'off');
  // Switching reminders back on should show the reminder, not resume a snooze
  // set an hour ago. Somebody turning it on is asking to be told.
  if (on) write(SNOOZE_KEY, null);
  emit();
}

/** Milliseconds until the current snooze ends. Zero when there is none. */
export function snoozeRemaining(now = Date.now()): number {
  const raw = read(SNOOZE_KEY);
  if (!raw) return 0;
  const until = Number(raw);
  if (!Number.isFinite(until)) return 0;
  // A clock that has moved backwards, or a value from a different century,
  // should not silence the reminder for the rest of time.
  if (until - now > 24 * 60 * 60 * 1000) return 0;
  return Math.max(0, until - now);
}

export function snooze(ms: number, now = Date.now()) {
  write(SNOOZE_KEY, String(now + ms));
  emit();
}

/** Called after an update is applied, so the next release starts clean. */
export function clearSnooze() {
  write(SNOOZE_KEY, null);
  emit();
}

/** Should a reminder be on screen right now? */
export function shouldRemind(now = Date.now()): boolean {
  return remindersOn() && snoozeRemaining(now) === 0;
}
