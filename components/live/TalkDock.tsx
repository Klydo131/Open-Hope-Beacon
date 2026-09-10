'use client';

// The chat that is always within reach, and says when somebody is waiting.
//
// ---------------------------------------------------------------------------
// TWO SHAPES, ONE COMPONENT.
//
//   PHONE  a badge on the way in, and the chat opens full screen at /talk.
//          A small floating panel on a small screen covers the thing it floats
//          over, which is why the phone does not get one.
//   WIDE   a docked panel at the corner, collapsed to a bar with a count and
//          expanded to a conversation beside the page rather than instead of
//          it. "Open full" hands over to the same route the phone uses.
//
// THE COUNT IS THE POINT. A chat you have to open to find out whether anything
// happened is a chat people stop opening. The number comes from the database in
// one call and falls the moment a thread is read, so it can be trusted; a badge
// that lies once is a badge nobody believes again.
//
// NOT A COPY OF ANYBODY'S MESSENGER. A collapsed bar that expands, and a count
// on the way in, are older than any product that ships them today. There is no
// presence, no typing indicator, no read receipts beyond the one this app
// already had, and no conversation that is not a pairing the church arranged.

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { useKeepUp, KEEP_UP_MY_PAIRING, KEEP_UP_TALK } from '@/lib/live/keep-up';
import { TalkSurface } from '@/components/live/TalkSurface';
import { showLocalNotification } from '@/lib/push';
import { APP_SHORT_NAME } from '@/lib/brand';

/** Remembered per device, so the dock opens the way you left it. */
const OPEN_KEY = 'beacon:talk-dock-open';

export function TalkDock() {
  const { profile } = useLiveSession();
  const router = useRouter();
  const path = usePathname();
  const [threads, setThreads] = useState<live.Thread[]>([]);
  const [open, setOpen] = useState(false);
  // What was already waiting when this device last looked, so arriving is told
  // apart from having-been-there-all-along. Without it, opening the app with
  // three unread pops three notifications for messages you already knew about.
  const [seen, setSeen] = useState<Record<string, number> | null>(null);

  const total = threads.reduce((sum, t) => sum + (Number(t.unread) || 0), 0);

  const refresh = useCallback(async () => {
    try {
      const rows = await live.listMyThreads();
      setThreads(rows);

      const now: Record<string, number> = {};
      for (const t of rows) now[t.pairing_id] = Number(t.unread) || 0;

      setSeen((before) => {
        // The first look establishes the baseline and announces nothing.
        if (before === null) return now;
        for (const t of rows) {
          const was = before[t.pairing_id] ?? 0;
          const is = now[t.pairing_id] ?? 0;
          // ONLY WHEN THE COUNT GOES UP, and never while that thread is on the
          // screen -- being told about a message you are looking at is the
          // fastest way to make somebody switch notifications off.
          if (is > was && !(path === '/talk' && typeof window !== 'undefined'
                            && window.location.search.includes(t.pairing_id))) {
            void showLocalNotification(
              APP_SHORT_NAME,
              `${t.other_name}: ${t.last_preview ?? 'sent you a message'}`,
              `/talk?with=${encodeURIComponent(t.pairing_id)}`,
            );
          }
        }
        return now;
      });
    } catch {
      /* A dock that cannot count is still a dock that opens. Silent on purpose:
         this runs on every screen, and an error banner from a background count
         would appear over whatever the person was actually doing. */
    }
  }, [path]);

  useEffect(() => {
    try { setOpen(localStorage.getItem(OPEN_KEY) === '1'); } catch { /* private mode */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useKeepUp(KEEP_UP_MY_PAIRING, refresh);
  // EVERY CONVERSATION, AND DEBOUNCED. This was a raw channel calling `refresh`
  // on every single row event with nothing between them, which is an
  // amplifier: one cheap insert by anybody woke every open app and each of
  // them asked the database to recount what was waiting. A burst of forty
  // messages was forty recounts per viewer, and up to forty notifications.
  // useKeepUp settles a burst into one reload, which is what every other
  // screen in the app has always done.
  useKeepUp(KEEP_UP_TALK, refresh);

  const setOpenAndRemember = (next: boolean) => {
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* private mode */ }
  };

  // Only the two people who have conversations, and never on the chat's own
  // page -- a dock floating over the room it opens is a second copy of it.
  if (!profile || (profile.role !== 'ds' && profile.role !== 'dm')) return null;
  if (path === '/talk') return null;

  return (
    <div className="safe-bottom fixed bottom-4 right-4 z-40 hidden xl:block">
      {open ? (
        <div className="flex h-[32rem] w-[22rem] flex-col overflow-hidden rounded-2xl bg-white lift-3 ring-1 ring-black/10">
          <div className="flex items-center gap-2 border-b border-black/5 bg-navy px-3 py-2 text-white">
            <span className="flex-1 text-sm font-bold">Talk</span>
            <button
              type="button"
              onClick={() => router.push('/talk')}
              className="tap-sm px-2 text-xs font-semibold underline"
            >
              Open full
            </button>
            <button
              type="button"
              onClick={() => setOpenAndRemember(false)}
              className="tap-sm px-2 text-xs font-semibold underline"
              aria-label="Close the chat panel"
            >
              Exit
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <TalkSurface compact />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpenAndRemember(true)}
          className="tap flex items-center gap-2 rounded-full bg-navy px-5 text-white lift-3"
        >
          <span aria-hidden>💬</span>
          <span className="font-bold">Talk</span>
          {total > 0 && (
            <span
              className="rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-navy"
              aria-label={`${total} waiting`}
            >
              {total > 99 ? '99+' : total}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
