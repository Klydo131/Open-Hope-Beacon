'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { roleLabel, NAVY } from '@/lib/brand';
import type { Role } from '@/lib/types';
import { homeFor, useLiveSession } from '@/lib/live/session';
import { HopeBeaconMark } from '@/components/HopeBeaconMark';
import { Avatar, Button, Card } from '@/components/ui';
import { LeftRail, RightRail, railGroupsFor } from '@/components/RoomRails';
import { useRoom } from '@/lib/room-theme';
import { LiveBell } from '@/components/LiveBell';
import { ModeSwitch } from '@/components/ModeSwitch';

/** One header link. Icon on a phone, icon and word once there is room. */
/**
 * The sections, in one place because they are rendered twice — inline from `lg`
 * up, and on their own scrolling row below it. Two hand-maintained copies of
 * the same list is how one of them ends up missing a page.
 */
const SECTIONS = (_role: Role) => [
  { href: '/church',   icon: '⛪', label: 'Church' },
  { href: '/library',  icon: '📚', label: 'Library' },
  { href: '/mail',     icon: '✉️', label: 'Mail' },
  { href: '/profile',  icon: '🙂', label: 'Profile' },
  { href: '/settings', icon: '⚙️', label: 'Settings' },
];

function ShellLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="tap-sm grid shrink-0 place-items-center gap-1 rounded-full bg-white/10 px-2.5 hover:bg-white/20 lg:flex lg:px-3"
    >
      <span aria-hidden>{icon}</span>
      <span className="hidden text-sm font-semibold lg:inline">{label}</span>
    </Link>
  );
}

export function LiveAppShell({
  allow,
  children,
}: {
  allow: Role[];
  children: React.ReactNode;
}) {
  const { session, profile, loading, error, signOut } = useLiveSession();
  const router = useRouter();

  // The office. These are the same rails the sample-data shell has used all
  // along — LeftRail, RightRail, the themes, the note, the ambient player.
  // They were never ported here, which is why the live app felt like a
  // different, smaller product than the one people were shown. Same components,
  // same hook, so the two cannot drift again without both drifting.
  //
  // Hidden below xl by the rails themselves, exactly as in the demo: a phone
  // and a tablet get the single column, because the page they flank is the one
  // that matters and there is no room for three.
  const room = useRoom(profile?.id ?? null, profile?.role ?? 'ds');

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
    else if (profile?.is_approved && !allow.includes(profile.role)) {
      router.replace(homeFor(profile.role));
    }
  }, [session, profile, loading, allow, router]);

  if (loading) return <LiveLoading />;
  if (!session) return null;

  if (!profile) {
    return (
      <CenteredCard title="Your account is not ready">
        <p className="text-gray-600">{error || 'Ask your Director to check your account.'}</p>
        <Button
          className="mt-4"
          onClick={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          Sign out
        </Button>
      </CenteredCard>
    );
  }

  if (!profile.is_approved) {
    return (
      <CenteredCard title="Your account is being reviewed">
        <p className="text-gray-600">
          Your invitation worked. A Director or Executive Director now needs to approve
          your account before you enter the app.
        </p>
        <p className="mt-3 text-sm text-gray-500">
          Signed in as {session.user.email ?? profile.full_name}
        </p>
        <Button
          className="mt-5"
          onClick={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          Sign out
        </Button>
      </CenteredCard>
    );
  }

  if (!allow.includes(profile.role)) return null;

  const groups = railGroupsFor(profile.role, {});
  const today: { label: string; value: string }[] = [];

  return (
    // THE THEME PAINTS THE PAGE, WHICH IS WHAT MAKES IT A THEME.
    //
    // This was a hard-coded light grey, and only the rails were themed. The
    // left navigation draws its labels in theme.ink with no surface of its own,
    // so choosing Slate wrote near-white text straight onto that grey page and
    // the whole of the left column disappeared. The right rail looked fine
    // because it paints theme.panel behind itself.
    //
    // `room-surface` is the same class the tutorial's shell uses, so both now
    // agree on what a theme is: the page, the rails and the panels together.
    <div className="room-surface min-h-screen" style={{ background: room.theme.bg }}>
      <header
        className="sticky z-20 text-white shadow-md"
        /* Sticks BELOW the tutorial bar when there is one. See AppShell. */
        style={{ backgroundColor: NAVY, top: 'var(--beacon-chrome-top, 0px)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-3 sm:px-4">
          <Link
            href={homeFor(profile.role)}
            className="flex min-w-0 flex-1 items-center gap-3"
            aria-label="Hope Beacon home"
          >
            <HopeBeaconMark size={40} />
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold sm:text-xl">Hope Beacon</p>
              <p className="truncate text-xs text-white/60">Live church app</p>
            </div>
          </Link>

          {/* THE REST OF THE APP.
              These pages existed and worked in live mode all along — the live
              shell simply did not link to any of them, while the demo shell
              linked to them all. So a signed-in member could reach their
              dashboard and nothing else. The pages were never missing; the door
              was.

              From `lg` up they sit inline. Below that they move to their own
              row underneath, because they cannot fit beside everything else —
              see the comment on that row. */}
          <nav className="hidden shrink-0 items-center gap-1 lg:flex" aria-label="Sections">
            {SECTIONS(profile.role).map((s) => (
              <ShellLink key={s.href} href={s.href} icon={s.icon} label={s.label} />
            ))}
          </nav>

          <ModeSwitch onDark />
          <LiveBell />

          <div className="hidden min-w-0 text-right sm:block">
            <p className="max-w-48 truncate text-sm font-semibold">{profile.full_name}</p>
            <p className="text-xs text-white/60">{roleLabel(profile.role, profile.role)}</p>
          </div>
          <Avatar name={profile.full_name || session.user.email || 'Member'} size={36} onDark />
          <button
            className="tap-sm shrink-0 rounded-xl bg-white/10 px-3 hover:bg-white/20"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await signOut();
              router.replace('/login');
            }}
          >
            {/* The words cost about 85px, which is a fifth of a 390px phone and
                the difference between a header that fits and one that does not.
                Sign out lives nowhere else in the app, so it stays on every
                size — as a symbol where there is no room for the sentence. */}
            <span className="hidden text-sm font-semibold sm:inline">Sign out</span>
            <span aria-hidden className="text-lg sm:hidden">⏻</span>
          </button>
        </div>

        {/* THE SAME LINKS, ON THEIR OWN ROW, BELOW `lg`.
            //
            All of this used to be one row. On a 390px iPhone that row needed
            about 600px — six 44px controls, an avatar, and a "Sign out" button,
            almost all of them `shrink-0` — so it ran off the side and took the
            whole page with it. What an iOS user saw was a tall empty strip down
            the right of every screen: the page had become wider than the phone,
            and that strip was the empty part of it.

            It scrolls inside itself (`overflow-x-auto`) rather than pushing the
            page, so even a longer list of sections can never do this again.

            HOME IS FIRST, and it is new. The header logo has always linked
            home, but a logo does not read as a button to somebody who has never
            used the app — several people had no way back to where they started
            and no reason to think the picture was one. */}
        <nav
          className="thin-scroll mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-3 pb-2 sm:px-4 lg:hidden"
          aria-label="Sections"
        >
          <ShellLink href={homeFor(profile.role)} icon="🏠" label="Home" />
          {SECTIONS(profile.role).map((s) => (
            <ShellLink key={s.href} href={s.href} icon={s.icon} label={s.label} />
          ))}
        </nav>
      </header>

      {/* Three columns from xl up, one column below it — the same breakpoint
          the sample-data shell uses, so a phone and a tablet get the identical
          layout there and here. The rails hide themselves; nothing about the
          page underneath changes. */}
      <div className="mx-auto flex max-w-[1600px] items-start gap-6 px-4">
        {room.prefs.leftRail && <LeftRail groups={groups} theme={room.theme} />}

        {/* pb-28 rather than pb-24, matching the demo. Several things float
            over the bottom of the screen — the install prompt, the feedback
            nudge — and a page that can scroll a little past its own content is
            what stops them sitting across the last line of a card. */}
        <main className="page-in mx-auto w-full min-w-0 max-w-5xl pb-28 pt-6">{children}</main>

        {room.prefs.rightRail && (
          <RightRail
            role={profile.role}
            name={profile.full_name}
            theme={room.theme}
            themes={room.themes}
            prefs={room.prefs}
            update={room.update}
            today={today}
          />
        )}
      </div>

      <footer className="border-t border-black/5 py-5 text-center text-xs text-gray-400">
        Invitation-only. Access is enforced by the church database.
      </footer>
    </div>
  );
}

export function LiveUnsupported() {
  return (
    <Card className="p-6">
      <h1 className="text-2xl font-extrabold text-navy">This live screen is being connected</h1>
      <p className="mt-2 text-gray-600">
        The secure invitation, approval, pairing and conversation path is live. This supporting
        screen remains available in the separate sample-data demo.
      </p>
    </Card>
  );
}

function LiveLoading() {
  return (
    <div className="grid min-h-screen place-items-center" style={{ backgroundColor: NAVY }}>
      <div className="text-center text-white">
        <HopeBeaconMark size={64} className="mx-auto" />
        <p className="mt-4 text-white/70">Opening Hope Beacon…</p>
      </div>
    </div>
  );
}

function CenteredCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4" style={{ backgroundColor: NAVY }}>
      <Card className="w-full max-w-md p-6 text-center">
        <HopeBeaconMark size={56} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-extrabold text-navy">{title}</h1>
        <div className="mt-3">{children}</div>
      </Card>
    </div>
  );
}
