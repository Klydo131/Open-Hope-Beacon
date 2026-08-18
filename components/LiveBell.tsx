'use client';

// The notification bell, live.
//
// A notification belongs to exactly one person and the policy says so. There is
// no insert policy at all: notifications are written by notify_user(), which is
// SECURITY DEFINER and checks that both people are in the same church. A client
// able to write this table directly could make the app say anything to anybody.

import { useCallback, useEffect, useState } from 'react';
import * as live from '@/lib/live/data';

export function LiveBell() {
  const [rows, setRows] = useState<live.AppNotification[]>([]);
  const [open, setOpen] = useState(false);

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
          <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
            {rows.length === 0 && <p className="p-2 text-sm text-gray-400">Nothing yet.</p>}
            {rows.map((n) => (
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
        </div>
      )}
    </div>
  );
}
