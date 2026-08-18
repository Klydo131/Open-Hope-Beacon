'use client';

// Move between the live app and the offline tutorial.
//
// The two are the SAME APP with the same features. Live keeps real people in a
// real database; the tutorial keeps sample people in this browser and works on
// a plane. Neither is a cut-down version of the other, and the switch exists so
// nobody has to take that on trust — you press it and see.
//
// HOW THE MODE IS ACTUALLY CHOSEN. lib/mode.ts asks one question: are Supabase
// keys present in this build? So a deployment is live or offline by
// configuration, not by a toggle somebody can flip by accident. This control
// therefore does one of two honest things rather than pretending:
//
//   - on a LIVE deployment it offers the tutorial, which is always available
//   - on an OFFLINE deployment it explains what turning live on requires
//
// A switch that claimed to enable a database it has no keys for would be the
// worst kind of button: the kind that looks like it worked.

import { useState } from 'react';
import Link from 'next/link';
import { IS_LIVE } from '@/lib/mode';

export function ModeSwitch({ onDark = false }: { onDark?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch between the live app and the tutorial"
        title="Live or tutorial"
        className={
          onDark
            ? 'tap-sm grid place-items-center rounded-full bg-white/10 px-2.5 hover:bg-white/20'
            : 'tap-sm grid place-items-center rounded-full bg-navy/5 px-2.5 hover:bg-navy/10'
        }
      >
        <span aria-hidden>{IS_LIVE ? '🟢' : '🧪'}</span>
        <span className="ml-1 hidden text-xs font-bold lg:inline">
          {IS_LIVE ? 'LIVE' : 'TUTORIAL'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-2xl bg-white p-4 text-left shadow-2xl ring-1 ring-black/10">
          <p className="font-bold text-navy">
            {IS_LIVE ? 'You are in the live app' : 'You are in the tutorial'}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {IS_LIVE
              ? 'Real people, real database, real security. Every feature here also works in the tutorial.'
              : 'Sample people kept in this browser. Works offline. Every feature here also works live.'}
          </p>

          <div className="mt-3 space-y-2">
            {IS_LIVE ? (
              <>
                <Link
                  href="/?tutorial=1"
                  className="block rounded-xl bg-navy/5 px-3 py-2 text-sm font-semibold text-navy hover:bg-navy/10"
                >
                  🧪 Open the tutorial
                </Link>
                <p className="text-xs text-gray-500">
                  Nothing you do there touches the church database.
                </p>
              </>
            ) : (
              <>
                <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  To run this against a real database, set{' '}
                  <span className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</span> and{' '}
                  <span className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> on your
                  host and redeploy.
                </p>
                <p className="text-xs text-gray-500">
                  That is the whole switch — there is no flag to remember.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
