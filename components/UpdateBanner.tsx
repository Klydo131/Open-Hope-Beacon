'use client';

import { useEffect, useState } from 'react';
import { useUpdateState } from '@/lib/app-update';
import {
  SNOOZE_MS,
  clearSnooze,
  onUpdatePrefsChange,
  shouldRemind,
  snooze,
} from '@/lib/update-prefs';

// The "a new version is here" reminder.
//
// It only ever appears when a new build is genuinely available, so applying it
// is a reload rather than a download-and-wait.
//
// It has two tempers. A newer build is worth knowing about: it says so once, and
// "Later" puts it away for eight hours. A build older than the one the server
// still supports is a different matter, because two people on two different
// builds can see two different answers to the same question — so it says more,
// and comes back in an hour. Neither one traps anybody: "Later" always works,
// and Settings can switch reminders off entirely.
//
// The reminder returns on its own. That is the part that used to be missing:
// dismissing it once silenced it until the app was closed and reopened, which on
// an installed app can be weeks.
export function UpdateBanner() {
  const { state, apply } = useUpdateState();
  const [applying, setApplying] = useState(false);
  // Re-evaluated on a timer because a snooze expires by the clock, not by an
  // event. A minute is far finer than the shortest snooze and costs nothing.
  const [, tick] = useState(0);

  useEffect(() => {
    const bump = () => tick((n) => n + 1);
    const every = setInterval(bump, 60_000);
    const off = onUpdatePrefsChange(bump);
    return () => {
      clearInterval(every);
      off();
    };
  }, []);

  const urgent = state === 'required';
  if ((state !== 'ready' && !urgent) || !apply) return null;
  if (!shouldRemind()) return null;

  return (
    <div className="no-print fixed inset-x-0 top-0 z-[60] flex justify-center p-3">
      <div className="animate-drop flex w-full max-w-md items-center gap-3 rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-black/10">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg"
          style={{ backgroundColor: urgent ? '#F59E0B' : '#E8B84B' }}
          aria-hidden
        >
          {urgent ? '⚠️' : '✨'}
        </span>
        <div className="min-w-0 flex-1">
          {/* Short enough to survive a 360px phone next to the button. The long
              version truncated to "A new ver…", which is the one thing a notice
              you are meant to act on must never do. */}
          <p className="font-bold text-navy">{urgent ? 'Please update' : 'Update ready'}</p>
          <p className="hidden text-sm text-gray-500 sm:block">
            {urgent
              ? 'This version is out of date. Your data stays, and nothing needs reinstalling.'
              : 'Restart to get the latest Beacon. Takes a second.'}
          </p>
        </div>
        <button
          onClick={() => {
            setApplying(true);
            clearSnooze();
            apply();
          }}
          disabled={applying}
          className="tap-sm shrink-0 rounded-xl px-4 text-sm font-bold text-white transition disabled:opacity-60"
          style={{ backgroundColor: '#1E2A4A' }}
        >
          {applying ? 'Updating…' : urgent ? 'Update' : 'Restart'}
        </button>
        <button
          onClick={() => snooze(urgent ? SNOOZE_MS.required : SNOOZE_MS.ready)}
          aria-label="Remind me later"
          title="Remind me later"
          className="tap-sm shrink-0 rounded-xl bg-gray-100 px-3 text-lg text-gray-500 transition hover:bg-gray-200"
        >
          ×
        </button>
      </div>
    </div>
  );
}
