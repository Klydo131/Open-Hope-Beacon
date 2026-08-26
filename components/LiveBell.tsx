'use client';

// The notification bell, live.
//
// A notification belongs to exactly one person and the policy says so. There is
// no insert policy at all: notifications are written by notify_user(), which is
// SECURITY DEFINER and checks that both people are in the same church. A client
// able to write this table directly could make the app say anything to anybody.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import * as live from '@/lib/live/data';

export function LiveBell() {
  const [rows, setRows] = useState<live.AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  // THE SWITCH LIVES WHERE THE BELL IS.
  //
  // It was in Settings, three taps away, and the panel itself had no control
  // of any kind. Somebody tapping a bell and finding one line of grey text has
  // been shown a broken feature, whatever is true elsewhere in the app.
  //
  // DEFAULT ON. `!== 'off'` rather than `=== 'on'`, so a member who has never
  // touched this gets alerts. Everyone reported not getting them, and a
  // default of off is indistinguishable from a bug.
  const [alerts, setAlerts] = useState(true);
  const [perm, setPerm] = useState<NotificationPermission>('default');

  useEffect(() => {
    try { setAlerts(localStorage.getItem('hb-alerts') !== 'off'); } catch { /* private mode */ }
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
  }, []);

  const flip = (on: boolean) => {
    setAlerts(on);
    try { localStorage.setItem('hb-alerts', on ? 'on' : 'off'); } catch { /* private mode */ }
  };

  const askDevice = async () => {
    if (typeof Notification === 'undefined') return;
    setPerm(await Notification.requestPermission());
  };

  const load = useCallback(async () => {
    try { setRows(await live.listNotifications()); }
    catch { /* a bell that cannot load is not worth an error over the page */ }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        className="tap-sm relative grid place-items-center rounded-full bg-white/10 px-2.5 hover:bg-white/20"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[11px] font-bold text-navy">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-2xl bg-white p-3 text-left shadow-2xl ring-1 ring-black/10">
          <div className="flex items-center justify-between">
            <p className="font-bold text-navy">Notifications</p>
            {unread > 0 && (
              <button
                onClick={async () => { await live.markAllNotificationsRead(); await load(); }}
                className="text-xs font-semibold text-navy underline"
              >
                Mark all read
              </button>
            )}
          </div>
          {/* THE ON AND OFF, RIGHT HERE, AS A SWITCH.
              A bare checkbox reads as a form field somebody has to submit. A
              switch reads as a thing that is already on or already off, which
              is what this is: it takes effect the moment it moves. */}
          <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 border-t border-black/5 pt-3">
            <span className="text-sm font-semibold text-navy">In-app notifications</span>
            <span className="relative inline-flex shrink-0">
              <input
                type="checkbox"
                role="switch"
                checked={alerts}
                onChange={(e) => flip(e.target.checked)}
                aria-label="In-app notifications"
                className="peer sr-only"
              />
              {/* The track. Green when on, because that is the one colour
                  everybody already reads as "this is running". */}
              <span
                aria-hidden
                className="block h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-green-500 peer-focus-visible:ring-2 peer-focus-visible:ring-navy peer-focus-visible:ring-offset-2"
              />
              {/* The knob. */}
              <span
                aria-hidden
                className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
              />
            </span>
          </label>

          {/* Device alerts are the browser's to grant, not ours. Asking is the
              only thing a page may do, and once refused it may not ask again,
              so that state says where to go instead of offering a dead button. */}
          {typeof Notification !== 'undefined' && perm !== 'granted' && (
            perm === 'denied' ? (
              <p className="mt-2 rounded-xl bg-gray-50 p-2.5 text-xs text-gray-600">
                Alerts on this device are blocked by your browser. Open the padlock
                beside the address to allow them.
              </p>
            ) : (
              <button
                onClick={askDevice}
                className="tap mt-2 w-full rounded-xl px-4 text-sm font-bold text-white"
                style={{ backgroundColor: '#1E2A4A' }}
              >
                Turn on device alerts
              </button>
            )
          )}

          <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
            {!alerts && (
              <p className="p-2 text-sm text-gray-500">
                Alerts are switched off. Anything that happens is still here when
                you turn them back on.
              </p>
            )}
            {alerts && rows.length === 0 && (
              <p className="p-2 text-sm text-gray-500">
                Nothing yet. A new message, a prayer request or somebody waiting to
                be approved will appear here.
              </p>
            )}
            {alerts && rows.map((n) => (
              <button
                key={n.id}
                onClick={async () => { if (!n.read_at) { await live.markNotificationRead(n.id); await load(); } }}
                className={`block w-full rounded-xl p-2 text-left hover:bg-gray-50 ${n.read_at ? '' : 'bg-navy/5'}`}
              >
                <p className="text-sm font-semibold text-navy">{n.title}</p>
                {n.body && <p className="text-xs text-gray-600">{n.body}</p>}
              </button>
            ))}
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="mt-2 block text-center text-xs font-semibold text-gray-400 underline"
          >
            More notification settings
          </Link>
        </div>
      )}
    </div>
  );
}
