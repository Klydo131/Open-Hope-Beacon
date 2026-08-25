'use client';

import { useEffect, useState } from 'react';

// Rooms, not a scroll.
//
// See docs/DESIGN.md, rule 1. The app is a church with rooms in it, and the
// room somebody needs most often is the first one. A Director pairs people and
// approves people every week and reads the board report once a month; pairing
// used to be the ninth section down one long page, so the most-used control in
// the app took the most scrolling to reach.
//
// WHY THE CHOICE IS REMEMBERED. Familiarity is the point. Somebody who works in
// Pairings all day should land in Pairings tomorrow, not be returned to a
// default they have to walk past again. It is stored per role, so a Director
// and an Executive keep their own places.
//
// WHY IT IS NOT A DROPDOWN. Every room is on screen at once, so the shape of
// the job is visible without opening anything. A dropdown hides how many rooms
// exist and makes the second visit no faster than the first.

export interface Room {
  id: string;
  label: string;
  /** Shown as a count beside the label. Omit when there is nothing to count. */
  badge?: number;
  /** Drawn in a way that says "this needs doing", not "this is a total". */
  urgent?: boolean;
}

export function useRoom(rooms: Room[], storageKey: string): [string, (id: string) => void] {
  const first = rooms[0]?.id ?? '';
  const [room, setRoom] = useState(first);

  // Read after mount, never during render: the server has no localStorage, and
  // reading it while rendering makes the first paint disagree with the second.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && rooms.some((r) => r.id === saved)) setRoom(saved);
    } catch { /* a private window is not a reason to lose the page */ }
    // rooms is rebuilt every render; comparing ids would be the only honest
    // dependency and it does not change after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const choose = (id: string) => {
    setRoom(id);
    try { localStorage.setItem(storageKey, id); } catch {}
  };

  return [room, choose];
}

export function RoomTabs({
  rooms,
  room,
  onChoose,
}: {
  rooms: Room[];
  room: string;
  onChoose: (id: string) => void;
}) {
  return (
    // Scrolls sideways on a narrow phone rather than wrapping into a block that
    // pushes the room itself off the screen. The page never scrolls sideways;
    // this strip does, inside its own box.
    <div
      role="tablist"
      aria-label="Rooms"
      className="no-print -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
    >
      {rooms.map((r) => {
        const on = r.id === room;
        return (
          <button
            key={r.id}
            role="tab"
            aria-selected={on}
            data-room={r.id}
            onClick={() => onChoose(r.id)}
            className={`tap-sm flex shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
              on ? 'text-white shadow' : 'bg-white text-navy ring-1 ring-black/5 hover:bg-gray-50'
            }`}
            style={on ? { backgroundColor: '#1E2A4A' } : undefined}
          >
            {r.label}
            {typeof r.badge === 'number' && r.badge > 0 && (
              // Urgent counts are drawn as something to clear, not as a total.
              // "3 waiting" and "3 members" should never look the same.
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                  r.urgent
                    ? 'bg-red-500 text-white'
                    : on ? 'bg-white/20 text-white' : 'bg-navy/10 text-navy'
                }`}
              >
                {r.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
