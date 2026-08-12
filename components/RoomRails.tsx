'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Role } from '@/lib/types';
import { roleLabel } from '@/lib/brand';
import { useRoom, type RoomTheme, type RoomPrefs } from '@/lib/room-theme';

// -------------------------------------------------------------------------
// The room rails — the workspace either side of the page on a wide screen.
//
// The brief, in one line: a Digital Seeker's room is a place to STUDY, not a
// place to be seen. There is no feed here, no follower count, no activity of
// other people. It is a desk, a lamp, a timer and a line they wrote for
// themselves. Everything about it is private and lives on their own device.
//
// Staff rooms are the same idea pointed at a different job. An admin
// member and a missionary all have people waiting on them, so their rail leads
// with the work: what is on the desk today, and one tap to each place they go.
// Same customisation, different furniture.
//
// Both rails are DESKTOP ONLY (`xl` and up). Below that the page is exactly
// what it was — phones get the single column, which is the one that fits.
//
// Nothing here touches a backend. Counts arrive as props so this file can be
// used by the demo shell and the live shell without pulling a database client
// into either bundle.
// -------------------------------------------------------------------------

export interface RailLink {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

export interface RailGroup {
  title: string;
  links: RailLink[];
}

// What each role sees, and in what order. The first group is the job; the last
// is always the person themselves.
export function railGroupsFor(
  role: Role,
  counts: {
    mail?: number;
    approvals?: number;
    seekers?: number;
    /** Unread release notes, or 1 when an update is waiting to be applied. */
    updates?: number;
  } = {},
  // The simulated mailbox is a demo-only screen; the live site has no /mail
  // route, and a rail link to a 404 is worse than no link.
  opts: { mail?: boolean } = { mail: true },
): RailGroup[] {
  const personal: RailGroup = {
    title: 'You',
    links: [
      { href: '/profile', label: 'Profile', icon: '🪪' },
      ...(opts.mail
        ? [{ href: '/mail', label: 'Mail', icon: '✉️', badge: counts.mail }]
        : []),
      { href: '/settings', label: 'Settings', icon: '⚙️' },
      // The replay lives inside Settings, which is not somewhere anyone thinks
      // to look for it — "I dont see any retake for tutorial in the desktop".
      // The anchor lands on the card rather than the top of the page.
      { href: '/settings#tutorial', label: 'Tutorial', icon: '✦' },
      // Same reasoning, same mistake, twice: "What's new" was only reachable by
      // going into Settings and scrolling, so it was asked for repeatedly as a
      // thing that did not exist. It is a standing part of the rail now, with a
      // badge when there is a release nobody has read.
      { href: '/settings#whats-new', label: "What's new", icon: '✨', badge: counts.updates },
      // Reachable from every screen on purpose. Nobody who has just hit a bug
      // goes looking through Settings for somewhere to report it.
      { href: '/settings#feedback', label: 'Feedback', icon: '💬' },
    ],
  };

  // The church home leads every rail. The billboard is where a person catches
  // up on the whole church before dropping into their own desk, so it sits at
  // the very top, ahead of the role dashboard and the resources shelf.
  const home = { href: '/church', label: 'Home', icon: '🏠' };

  if (role === 'ds') {
    return [
      {
        title: 'My room',
        links: [
          home,
          { href: '/ds', label: 'My Journey', icon: '🎯' },
          { href: '/library', label: 'My Library', icon: '📚' },
        ],
      },
      personal,
    ];
  }

  if (role === 'dm') {
    return [
      {
        title: 'My desk',
        links: [
          home,
          { href: '/dm', label: 'My Explorers', icon: '🤝', badge: counts.seekers },
          { href: '/library', label: 'Resources', icon: '📚' },
        ],
      },
      personal,
    ];
  }

  // admin + executive
  return [
    {
      title: 'The office',
      links: [
        home,
        { href: '/admin', label: 'Admin', icon: '🛡️', badge: counts.approvals },
        { href: '/library', label: 'Resources', icon: '📚' },
      ],
    },
    personal,
  ];
}

// ---------------------------------------------------------------- left rail

export function LeftRail({
  groups,
  theme,
}: {
  groups: RailGroup[];
  theme: RoomTheme;
}) {
  const path = usePathname();

  return (
    <nav
      aria-label="Workspace"
      className="compact-ui thin-scroll sticky top-[76px] hidden max-h-[calc(100vh-96px)] w-56 shrink-0 overflow-y-auto pb-6 xl:block"
    >
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.title}>
            <p
              className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider"
              style={{ color: theme.inkSoft }}
            >
              {g.title}
            </p>
            <div className="space-y-0.5">
              {g.links.map((l) => {
                const on = path === l.href || path.startsWith(`${l.href}/`);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={on ? 'page' : undefined}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold"
                    style={{
                      backgroundColor: on ? theme.accent : 'transparent',
                      color: on ? '#fff' : theme.ink,
                    }}
                  >
                    <span aria-hidden className="text-base">
                      {l.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{l.label}</span>
                    {!!l.badge && (
                      <span
                        className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold"
                        style={{
                          backgroundColor: on ? 'rgba(255,255,255,0.25)' : theme.accent,
                          color: '#fff',
                        }}
                      >
                        {l.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

// --------------------------------------------------------------- right rail

export function RightRail({
  role,
  name,
  theme,
  themes,
  prefs,
  update,
  today,
}: {
  role: Role;
  name: string;
  theme: RoomTheme;
  themes: RoomTheme[];
  prefs: RoomPrefs;
  update: (p: Partial<RoomPrefs>) => void;
  today?: { label: string; value: string }[];
}) {
  const seeker = role === 'ds';

  return (
    <aside
      aria-label={seeker ? 'My room' : 'My office'}
      className="compact-ui thin-scroll sticky top-[76px] hidden max-h-[calc(100vh-96px)] w-72 shrink-0 space-y-3 overflow-y-auto pb-6 xl:block"
    >
      <RoomCard
        seeker={seeker}
        role={role}
        name={name}
        theme={theme}
        themes={themes}
        prefs={prefs}
        update={update}
      />

      {seeker ? <FocusTimer theme={theme} /> : <TodayCard theme={theme} today={today} />}

    </aside>
  );
}

function RoomCard({
  seeker,
  role,
  name,
  theme,
  themes,
  prefs,
  update,
}: {
  seeker: boolean;
  role: Role;
  name: string;
  theme: RoomTheme;
  themes: RoomTheme[];
  prefs: RoomPrefs;
  update: (p: Partial<RoomPrefs>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(prefs.motto);

  useEffect(() => setDraft(prefs.motto), [prefs.motto]);

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: theme.panel, border: `1px solid ${theme.line}` }}
    >
      <p
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: theme.inkSoft }}
      >
        {seeker ? 'My room' : 'My office'}
      </p>
      <p className="mt-0.5 truncate text-base font-extrabold" style={{ color: theme.ink }}>
        {name}
      </p>
      {roleLabel(role) && (
        <p className="text-xs" style={{ color: theme.inkSoft }}>
          {roleLabel(role)}
        </p>
      )}

      {/* A line you write for yourself. Nobody else ever sees it — it is not
          a status, it is a note on your own desk. */}
      <div className="mt-3">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 80))}
              rows={2}
              autoFocus
              placeholder={
                seeker ? 'A verse, or why you started…' : 'What matters this week…'
              }
              className="w-full min-w-0 resize-none rounded-lg px-2 py-1.5 text-sm outline-none"
              style={{
                backgroundColor: 'transparent',
                color: theme.ink,
                border: `1px solid ${theme.line}`,
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  update({ motto: draft.trim() });
                  setEditing(false);
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                style={{ backgroundColor: theme.accent }}
              >
                Save
              </button>
              <button
                onClick={() => {
                  setDraft(prefs.motto);
                  setEditing(false);
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ color: theme.inkSoft }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="w-full rounded-lg px-2 py-1.5 text-left text-sm italic"
            style={{
              color: prefs.motto ? theme.ink : theme.inkSoft,
              border: `1px dashed ${theme.line}`,
            }}
          >
            {prefs.motto || (seeker ? '＋ Add a line for yourself' : '＋ Add a note')}
          </button>
        )}
      </div>

      {/* Theme picker — the actual "make it mine" control. */}
      <p
        className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: theme.inkSoft }}
      >
        {seeker ? 'Room' : 'Office'}
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {themes.map((t) => {
          const on = t.key === prefs.theme;
          return (
            <button
              key={t.key}
              onClick={() => update({ theme: t.key })}
              title={`${t.label} — ${t.blurb}`}
              aria-label={t.label}
              aria-pressed={on}
              className="h-8 rounded-lg"
              style={{
                background: t.bg,
                border: on ? `2px solid ${theme.accent}` : `1px solid ${theme.line}`,
                boxShadow: on ? `0 0 0 2px ${theme.panel}` : undefined,
              }}
            />
          );
        })}
      </div>
      <p className="mt-1.5 text-xs" style={{ color: theme.inkSoft }}>
        {theme.label} — {theme.blurb}
      </p>
    </div>
  );
}

// A study timer. The one thing a private study room needs that a feed never
// gives you: a defined stretch of undisturbed time.
function FocusTimer({ theme }: { theme: RoomTheme }) {
  const PRESETS = [15, 25, 45];
  const [mins, setMins] = useState(25);
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          setDone(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running]);

  const set = (m: number) => {
    setMins(m);
    setLeft(m * 60);
    setRunning(false);
    setDone(false);
  };

  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const pct = mins > 0 ? ((mins * 60 - left) / (mins * 60)) * 100 : 0;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: theme.panel, border: `1px solid ${theme.line}` }}
    >
      <p
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: theme.inkSoft }}
      >
        Study time
      </p>

      <p
        className="mt-1 text-center text-4xl font-extrabold tabular-nums"
        style={{ color: done ? theme.accent : theme.ink }}
        aria-live="polite"
      >
        {mm}:{ss}
      </p>

      <div
        className="mt-2 h-1 overflow-hidden rounded-full"
        style={{ backgroundColor: theme.line }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%`, backgroundColor: theme.accent }}
        />
      </div>

      {done ? (
        <p className="mt-2 text-center text-sm font-semibold" style={{ color: theme.accent }}>
          ✓ Well done. Time's up.
        </p>
      ) : null}

      <div className="mt-3 flex gap-1.5">
        {PRESETS.map((m) => (
          <button
            key={m}
            onClick={() => set(m)}
            className="flex-1 rounded-lg py-1.5 text-xs font-semibold"
            style={{
              backgroundColor: m === mins ? theme.accent : 'transparent',
              color: m === mins ? '#fff' : theme.inkSoft,
              border: `1px solid ${m === mins ? theme.accent : theme.line}`,
            }}
          >
            {m}m
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-1.5">
        <button
          onClick={() => {
            setDone(false);
            setRunning((r) => !r);
          }}
          disabled={left === 0}
          className="flex-1 rounded-lg py-2 text-sm font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: theme.accent }}
        >
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          onClick={() => set(mins)}
          className="rounded-lg px-3 py-2 text-sm font-semibold"
          style={{ color: theme.inkSoft, border: `1px solid ${theme.line}` }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// The staff equivalent: what is on the desk right now.
function TodayCard({
  theme,
  today,
}: {
  theme: RoomTheme;
  today?: { label: string; value: string }[];
}) {
  const now = new Date();
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: theme.panel, border: `1px solid ${theme.line}` }}
    >
      <p
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: theme.inkSoft }}
      >
        On the desk
      </p>
      <p className="mt-0.5 text-sm font-bold" style={{ color: theme.ink }}>
        {now.toLocaleDateString([], {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </p>

      {today && today.length > 0 ? (
        <div className="mt-3 space-y-2">
          {today.map((t) => (
            <div key={t.label} className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm" style={{ color: theme.inkSoft }}>
                {t.label}
              </span>
              <span className="text-lg font-extrabold" style={{ color: theme.ink }}>
                {t.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm" style={{ color: theme.inkSoft }}>
          Nothing waiting. A good place to be.
        </p>
      )}
    </div>
  );
}

export { useRoom };
