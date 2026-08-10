'use client';

import { useEffect, useState } from 'react';

// -------------------------------------------------------------------------
// The Beacon loader.
//
// A lighthouse that sweeps its beam while you wait. Built entirely from SVG
// and CSS — no image to download, no animation library, and it renders on the
// very first paint, which is the only time a splash screen is any use.
//
// Two forms:
//   <BeaconSplash />  full screen, for the app's first load
//   <BeaconSpinner /> inline, for a section that is fetching
//
// Both respect prefers-reduced-motion: the sweep stops and the mark simply
// fades, because a rotating beam is exactly the kind of motion that makes some
// people ill.
// -------------------------------------------------------------------------

function Mark({ size = 96 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden
      className="beacon-mark"
    >
      <defs>
        <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#E8B84B" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#E8B84B" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The sweeping beam, behind the tower. */}
      <g className="beacon-beam" style={{ transformOrigin: '60px 34px' }}>
        <polygon points="60,34 120,4 120,64" fill="url(#beam)" />
      </g>

      <circle cx="60" cy="60" r="58" fill="#E8B84B" className="beacon-halo" />
      <path d="M60 20 L75 75 H45 Z" fill="#1E2A4A" />
      <rect x="49" y="75" width="22" height="22" rx="3" fill="#1E2A4A" />
      <circle cx="60" cy="33" r="7.5" fill="#fff" className="beacon-lamp" />
    </svg>
  );
}

export function BeaconSplash({
  label = 'Lighting the way…',
}: {
  label?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center"
      style={{ backgroundColor: '#1E2A4A' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <Mark size={104} />
        <div>
          <p className="text-2xl font-extrabold tracking-tight text-white">
            Beacon
          </p>
          <p className="mt-1 text-sm text-white/60">{label}</p>
        </div>
        <div className="beacon-track h-1 w-40 overflow-hidden rounded-full bg-white/15">
          <div className="beacon-bar h-full w-1/3 rounded-full bg-gold" />
        </div>
      </div>
    </div>
  );
}

export function BeaconSpinner({
  label = 'Loading…',
  size = 48,
}: {
  label?: string;
  size?: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-10"
      role="status"
      aria-live="polite"
    >
      <Mark size={size} />
      <p className="text-sm font-semibold text-gray-400">{label}</p>
    </div>
  );
}

// Wraps the app on first mount: shows the splash until the client is ready,
// then fades it out. `minMs` keeps it on screen just long enough to read as
// intentional rather than a flash of navy.
export function BootSplash({
  ready,
  minMs = 550,
}: {
  ready: boolean;
  minMs?: number;
}) {
  const [done, setDone] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      setLeaving(true);
      setTimeout(() => setDone(true), 320);
    }, minMs);
    return () => clearTimeout(t);
  }, [ready, minMs]);

  if (done) return null;
  return (
    <div className={leaving ? 'beacon-splash-out' : undefined}>
      <BeaconSplash />
    </div>
  );
}
