'use client';

import { useEffect, useRef, useState } from 'react';
import { useOnline } from '@/lib/online';
import { useUpdateState } from '@/lib/app-update';

// The online/offline indicator.
//
// Offline is a state that changes what the app can do, so it is stated plainly
// and stays on screen the whole time it is true, not a toast that disappears
// before it has been read. Coming back is the opposite: it is good news and
// nobody needs a permanent badge for it, so it confirms once and leaves.
//
// It drops below the update banner when one is showing. Both are pinned to the
// top, and stacked on top of each other the pill covered the Restart button, so
// the one notice you could act on was the one you could not reach.
//
// The wording differs by site, because the truth differs. On the demo every
// scrap of data is already on the device, so offline costs nothing and the
// message should not alarm. On the live site the person's own saved work is
// local but anything involving other people needs the network, and pretending
// otherwise would be a lie they discover at the worst moment.
export function OnlineStatus() {
  const { online } = useOnline();
  const update = useUpdateState();
  const [justBack, setJustBack] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setJustBack(false);
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setJustBack(true);
      const t = setTimeout(() => setJustBack(false), 4000);
      return () => clearTimeout(t);
    }
  }, [online]);

  // Sit below the update banner rather than on top of it. Both tempers of the
  // banner occupy the same strip, so both have to shift this.
  const shifted =
    update.state === 'ready' || update.state === 'required' ? 'top-[4.25rem]' : 'top-2';

  if (!online) {
    return (
      <div
        className={`no-print pointer-events-none fixed right-3 ${shifted} z-[70] flex justify-end`}
        role="status"
        aria-live="polite"
      >
        <div
          className="animate-drop flex max-w-[80vw] items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-lg"
          style={{ backgroundColor: '#7C2D12' }}
        >
          <span aria-hidden>⚡</span>
          <span>
            Offline.{' '}
            <span className="font-normal">
              Everything here still works
            </span>
          </span>
        </div>
      </div>
    );
  }

  if (justBack) {
    return (
      <div
        className={`no-print pointer-events-none fixed right-3 ${shifted} z-[70] flex justify-end`}
        role="status"
        aria-live="polite"
      >
        <div
          className="animate-drop flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-lg"
          style={{ backgroundColor: '#166534' }}
        >
          <span aria-hidden>✓</span>
          <span>Back online</span>
        </div>
      </div>
    );
  }

  return null;
}

// The same state as a quiet inline row, for Settings — somewhere to look on
// purpose rather than waiting for a banner to appear.
export function OnlineRow() {
  const { online, checking } = useOnline();
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: online ? '#16A34A' : '#DC2626' }}
      />
      <span className="font-semibold" style={{ color: online ? '#16A34A' : '#DC2626' }}>
        {checking ? 'Checking…' : online ? 'Online' : 'Offline'}
      </span>
    </div>
  );
}
