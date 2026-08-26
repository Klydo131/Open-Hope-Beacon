'use client';

import Link from 'next/link';
import { RoomTabs, useRoom, type Room } from '@/components/Rooms';
import { MinorBadge } from '@/components/MinorBadge';
import { copyText } from '@/lib/share';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NAVY, roleNoun, stageInfo } from '@/lib/brand';
import { homeFor, useLiveSession } from '@/lib/live/session';
import * as live from '@/lib/live/data';
import { LiveReportControl, LiveReportsForDirector } from '@/components/LiveSafeguarding';
import { LiveTrialRoom, LiveCourt } from '@/components/LiveTrialRoom';
import { LiveGuilds, LiveChurchPulse } from '@/components/LiveGuilds';
import { clearBrowserSession, saveBrowserSession, supabaseAuth } from '@/lib/supabase/client';
import type { Message, Profile, Role } from '@/lib/types';
import { HopeBeaconMark } from '@/components/HopeBeaconMark';
import { LiveAppShell } from '@/components/LiveAppShell';
import { useTutorialMode } from '@/lib/tutorial';
import { LiveBlogDesk, LiveBlogFeed } from '@/components/LiveBlog';
import { LiveAskForPrayer, LivePrayerForGuide, LivePrayerWall } from '@/components/LivePrayer';
import { MessageBox } from '@/components/MessageBox';
import { useDraft, clearDraft } from '@/lib/drafts';
import { Linked } from '@/components/Linked';
import { LiveLibraryForGuide, LiveSharedWithMe } from '@/components/LiveLibrary';
import { LiveChurchOverview, LiveBoardReport } from '@/components/LiveExecutive';
import { LiveRecommend, LiveRecommendationsForDirector, LiveFollowUps, LiveLessonSeries } from '@/components/LiveMinistry';
import { Avatar, Button, Card } from '@/components/ui';

const emailLooksValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';

function PublicHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
      <div className="mx-auto flex max-w-md flex-col items-center">
        <Link href="/" className="text-sm text-white/60 underline">
          ← Home
        </Link>
        <HopeBeaconMark size={58} className="mt-3" />
        <h1 className="mt-3 text-3xl font-extrabold">{title}</h1>
        <p className="mt-1 text-white/70">{subtitle}</p>
      </div>
    </div>
  );
}

export function LiveHomePage() {
  const { session, profile, loading } = useLiveSession();
  const { enterTutorial } = useTutorialMode();
  const router = useRouter();

  useEffect(() => {
    // Some Supabase mail templates return to the configured site root. Route
    // only authentication callbacks into the password screen; an ordinary
    // Sign in tap still goes straight to /login.
    const query = window.location.search;
    const hash = window.location.hash;
    if (/\b(code|token_hash)=/.test(query) || /\baccess_token=/.test(hash)) {
      router.replace(`/join${query}${hash}`);
    }
  }, [router]);

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: NAVY }}>
      <main className="mx-auto flex min-h-[100svh] max-w-lg flex-col items-center justify-center px-4 py-10 text-center">
        <HopeBeaconMark size={92} />
        <h1 className="mt-6 text-5xl font-extrabold tracking-tight">Hope Beacon</h1>
        {/* THE THEME FIRST, THE MECHANISM SECOND. This door used to lead with
            "One person, walking with one person" — true, and a description of
            how the app works rather than what it is for. Somebody arriving from
            an invitation reads the top line and nothing else. */}
        <p className="mt-3 text-xl font-semibold text-white/90">
          Walking with Jesus, one step at a time.
        </p>
        <p className="mt-1 text-base text-white/60">
          And never on your own. One person, walking with one person.
        </p>

        <Button
          variant="gold"
          className="mt-9 w-full text-xl"
          disabled={loading}
          onClick={() =>
            router.push(session && profile ? homeFor(profile.role) : '/login')
          }
        >
          {session && profile ? `Continue as ${profile.full_name.split(' ')[0] || 'member'}` : 'Sign in'}
        </Button>

        <Link href="/signup" className="mt-5 font-semibold underline underline-offset-4">
          I have an invitation
        </Link>
        <p className="mt-7 max-w-sm text-sm leading-relaxed text-white/55">
          By invitation. Someone from your church brings you in, so there is
          nothing to sign up for here.
        </p>

        {/* THE WAY INTO THE TUTORIAL, AND IT HAS TO BE ON THIS SCREEN.
            "Invitation only, there is no public sign-up" is true and it is also
            a closed door to everybody who has not been invited yet — which is
            every church still deciding, and every IT person asked to evaluate
            this. They arrived here, read that sentence, and had nowhere to go.
            The tutorial existed and was compiled into this very page, and there
            was no link to it anywhere.

            Kept BELOW the real door on purpose. A member arriving with an
            invitation should never have to read past a tutorial pitch to find
            the way in — this is a real app that comes with a demonstration, not
            a demonstration wearing an app's clothes. */}
        <div className="mt-10 w-full max-w-sm rounded-2xl bg-white/10 p-5 text-center ring-1 ring-white/15">
          <p className="text-base font-bold">Not invited yet? Look around first.</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">
            A complete working church with sample people in it. Every feature the
            real app has, including the guided walk for your role.
          </p>
          <button
            type="button"
            onClick={() => {
              enterTutorial();
              router.push('/');
            }}
            className="tap mt-4 w-full rounded-xl bg-white/90 px-4 font-bold text-navy hover:bg-white"
          >
            🧪 Open the tutorial
          </button>
          <p className="mt-2.5 text-xs text-white/55">
            Runs entirely in this browser. No account, no database, nothing sent
            anywhere — and nothing you do there can touch a church's real data.
          </p>
        </div>

        <a
          href="https://github.com/Klydo131/Open-Hope-Beacon"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-9 text-sm text-white/65 underline underline-offset-4"
        >
          Developers: view and contribute on GitHub ↗
        </a>
      </main>
    </div>
  );
}

export function LiveLoginPage() {
  const router = useRouter();
  const { session, profile, loading: sessionLoading, signOut } = useLiveSession();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => {
    switch (params.get('error')) {
      case 'credentials': return 'That email and password did not match.';
      case 'missing': return 'Enter your e-mail and password.';
      case 'profile': return 'Your account profile is not ready yet.';
      case 'unavailable': return 'Could not reach live sign-in. Please try again.';
      default: return '';
    }
  });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!sessionLoading && session && profile?.is_approved) {
      router.replace(homeFor(profile.role));
    }
  }, [sessionLoading, session, profile, router]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    if (!emailLooksValid(email) || typeof password !== 'string' || !password) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const mine = await live.signIn(email, password);
      if (!mine.is_approved) {
        // SAY SOMETHING. This used to be `window.location.replace('/login')`,
        // which reloaded the very page the person was already looking at and
        // told them nothing. From the other side of the screen that is
        // indistinguishable from a wrong password: you type a password you know
        // is right, the page blinks, and you are back at the form. People
        // retype it, then conclude the app is broken — and they are not wrong
        // to, because a correct password that appears to do nothing IS broken.
        setError(
          'Your password is correct, but your account is waiting for a Director to approve it. '
          + 'Ask your church to approve you, then sign in again.',
        );
        return;
      }
      window.location.replace(homeFor(mine.role));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!emailLooksValid(email)) {
      setError('Enter your e-mail first.');
      return;
    }
    const client = supabaseAuth();
    if (!client) return;
    setBusy(true);
    setError('');
    const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/join?recovery=1`,
    });
    setBusy(false);
    if (resetError) setError(resetError.message);
    else setNotice('If that address has an account, a password-reset e-mail is on its way.');
  };

  if (session && profile && !profile.is_approved) {
    return (
      <div className="min-h-screen">
        <PublicHeader title="Account awaiting approval" subtitle="Your invitation and password worked." />
        <div className="mx-auto max-w-md px-4 py-8">
          <Card className="p-6 text-center">
            <p className="text-gray-600">
              A Director or Executive Director must approve your account before you enter the app.
            </p>
            <Button
              className="mt-5"
              onClick={async () => {
                await signOut();
              }}
            >
              Sign out
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PublicHeader title="Sign in to Hope Beacon" subtitle="Use your live church account." />
      <div className="mx-auto max-w-md space-y-5 px-4 py-8">
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-gray-600">E-mail</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError('');
                }}
                className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-gray-600">Password</span>
              {/* An eye, because a password box you cannot read back is where
                  a wrong character hides — and on a phone keyboard that is most
                  of them. Standard everywhere else; it was missing here. */}
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  className="tap w-full rounded-xl bg-gray-100 px-4 pr-12 text-lg outline-none focus:ring-2 focus:ring-gold"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-lg hover:bg-black/5"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </label>
            {error && <Notice tone="error">{error}</Notice>}
            {notice && <Notice tone="success">{notice}</Notice>}
            <Button type="submit" variant="gold" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {/* WHERE "TRY AN ACCOUNT" WENT.
              Three buttons used to sit here that signed you in as Maria, John
              or Pastor Ramos against THIS database, using seeded rows and a
              shared password. It was removed, and the reason is worth keeping.

              The tutorial is not part of the live app. Those buttons made it
              part of it: trying the app meant putting invented members into a
              real church's database and signing in as them. A church that had
              not run the seed got "those sample accounts are not in this
              database" — which reads as the app being broken — and a church
              that HAD run it now has fictional people in its member list and a
              shared password on three real accounts.

              Somebody who wants to look around before joining goes to the
              tutorial, which is offline, invents its people in the browser, and
              cannot reach any database at all. That is a cleaner answer to the
              same question, and it is the one on the front door. */}
          <form onSubmit={() => {}} className="hidden">
          </form>
          <button
            type="button"
            onClick={resetPassword}
            disabled={busy}
            className="mx-auto mt-4 block text-sm text-gray-500 underline"
          >
            Forgot your password?
          </button>
        </Card>

        <Card className="p-5 text-center">
          <p className="font-bold text-navy">Invited for the first time?</p>
          <p className="mt-1 text-sm text-gray-600">Open the invitation e-mail and set your password there.</p>
          <Link href="/signup" className="mt-3 inline-block font-semibold text-navy underline">
            Invitation help
          </Link>
        </Card>
      </div>
    </div>
  );
}


export function LiveSignupPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader title="Join Hope Beacon" subtitle="There is no public registration." />
      <div className="mx-auto max-w-md space-y-5 px-4 py-8">
        <Card className="p-6">
          <h2 className="text-xl font-bold text-navy">Open your invitation e-mail</h2>
          <p className="mt-2 text-gray-600">
            Tap its invitation button. Hope Beacon will verify the e-mail, ask you to set a password,
            and place your account in the role chosen by your church.
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="text-xl font-bold text-navy">No e-mail yet?</h2>
          <p className="mt-2 text-gray-600">
            Ask your Director to check the address and send a new invitation. Also check Spam and Promotions.
          </p>
        </Card>
        <p className="text-center text-sm text-gray-500">
          Already set a password?{' '}
          <Link href="/login" className="font-semibold text-navy underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

// The invited person's front door.
//
// This is the ONE screen where somebody who has never used Hope Beacon, was
// sent a link by their church, and has no account yet, becomes a member. Three
// separate things had to be right for that to happen and none of them were:
//
//   1. THE LINK HAD TO REDEEM. It arrived as `?code=…` and was pushed through
//      exchangeCodeForSession, which is the PKCE route and needs a verifier
//      this browser never had. Every invitation failed identically, which is
//      why it read as "it just errors" rather than as anything intermittent.
//      Invitations now arrive as `?token_hash=…&type=invite` and redeem
//      through verifyOtp, which needs nothing from the device.
//
//   2. IT HAD TO ASK WHAT THE CHURCH ACTUALLY NEEDS. This asked for a name and
//      a password. The form the client specified — the one the demo has always
//      shown — asks a little about the person and, before any of it, asks
//      permission to keep it. Showing one form in the demo and a different one
//      live is the gap that makes a demo feel like an advertisement.
//
//   3. ACCEPTING HAD TO PUT THEM IN THE APP. It ended on "one approval
//      remains" for everybody, including people whose Director had personally
//      addressed the invitation. Migration 0013 makes a matched invitation the
//      approval, so an invited person now lands on their own home screen.
export function LiveJoinPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { refreshProfile } = useLiveSession();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [donePending, setDonePending] = useState(false);
  const [error, setError] = useState('');
  const [churchName, setChurchName] = useState('');
  const [role, setRole] = useState<Role>('ds');
  const recovery = params.get('recovery') === '1' || params.get('type') === 'recovery';

  // WHOSE DEVICE IS THIS?
  //
  // Redeeming an invitation link signs this browser in as the invited person.
  // If somebody is already signed in here — a Director who copied the link to
  // check it works, a family sharing a tablet — that person was signed out and
  // replaced without a word. It read as the app logging people out at random,
  // and it also marked the invited person as arrived when they had not touched
  // anything.
  //
  // So nothing is redeemed until whoever is sitting here says the link is
  // theirs. `handover` is that answer.
  const [signedInAs, setSignedInAs] = useState('');
  const [handover, setHandover] = useState(false);

  // The optional half of the form. Everything here is the person's to give or
  // withhold, so it starts collapsed and nothing in it blocks the button.
  const [consent, setConsent] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [extra, setExtra] = useState({
    preferred_contact: '',
    birthday: '',
    gender: '',
    life_status: '',
    city_of_residence: '',
    work_industry: '',
    topics: '',
  });
  const setExtraField =
    (key: keyof typeof extra) => (event: React.ChangeEvent<HTMLInputElement>) =>
      setExtra((prev) => ({ ...prev, [key]: event.target.value }));

  useEffect(() => {
    let alive = true;
    const establishSession = async () => {
      const client = supabaseAuth();
      if (!client) return;
      try {
        const tokenHash = params.get('token_hash');
        const code = params.get('code');
        const codeEmail = params.get('email');
        const kind = params.get('type') === 'recovery' ? 'recovery' : 'invite';

        // SUPABASE REPORTS A DEAD LINK IN THE HASH, NOT THE QUERY. An expired
        // or already-used link arrives as
        // `#error=access_denied&error_code=otp_expired`, with no token at all.
        // Nothing looked for it, so the page found nothing to redeem, carried
        // on, and fell through to whatever session happened to be in the
        // browser already — presenting one person's account as another
        // person's invitation. Read it first and say so.
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const linkError = hashParams.get('error_description') || hashParams.get('error');
        if (linkError) {
          throw new Error(
            /expired/i.test(linkError)
              // NAME THE LIKELIEST CAUSE FIRST, BECAUSE IT IS ALSO THE ONE
              // THE READER CAN FIX WITHOUT ASKING ANYBODY.
              //
              // A church has exactly one live invitation per person: sending a
              // second replaces the first, which is correct, because a link
              // that outlived its replacement would be a way in that nobody
              // could revoke. But every invitation email is identical -- same
              // subject, same wording, same sender -- so a Director who pressed
              // Send twice leaves the invited person holding several messages
              // with no way to tell which one is alive, and the older ones fail
              // exactly like a genuinely expired link.
              //
              // The old wording, "expired or already used", sent that person
              // back to the church for a THIRD invitation, which killed the
              // second and repeated the whole loop. Saying "open the newest
              // email" first ends it, and costs nothing when the cause really
              // was age.
              ? 'This link is not the current one. If your church sent more than one '
                + 'invitation, only the newest email works -- open the most recent one '
                + 'and use its button. Otherwise this link has expired, and your church '
                + 'can send a fresh one.'
              : decodeURIComponent(linkError.replace(/\+/g, ' ')),
          );
        }

        const redeeming = Boolean(tokenHash || code);

        // ASK BEFORE SIGNING ANYBODY OUT.
        //
        // A browser that already holds a session must not keep it while a link
        // is redeemed — that is how an Explorer's invitation came to display a
        // Guide's account, and whoever was sitting there could have finished
        // somebody else's sign-up or changed their password.
        //
        // But clearing it silently is the other half of the same bug. The first
        // version did exactly that, and the person it caught was the Director:
        // they copy the join link the invitation screen hands them, open it to
        // check it works, and are signed out of their own account and into the
        // account of the person they just invited. Ask, name who is signed in,
        // and let them back out.
        if (redeeming && !handover) {
          const { data: current } = await client.auth.getSession();
          const who = current.session?.user?.email ?? '';
          if (who) {
            if (alive) { setSignedInAs(who); setReady(true); }
            return;
          }
        }

        if (redeeming) {
          await client.auth.signOut({ scope: 'local' }).catch(() => {});
          clearBrowserSession();
        }

        if (tokenHash) {
          // The normal path. Works on any device, because the token carries
          // everything needed to redeem it.
          const { error: otpError } = await client.auth.verifyOtp({ token_hash: tokenHash, type: kind });
          if (otpError) throw otpError;
        } else if (code && codeEmail) {
          // The six-digit fallback, for a mail client that mangled the link.
          // Redeemed against the address it was issued for — NOT through
          // exchangeCodeForSession, which is the mistake this whole screen was
          // built on.
          const { error: otpError } = await client.auth.verifyOtp({
            email: codeEmail,
            token: code,
            type: kind,
          });
          if (otpError) throw otpError;
        } else if (code) {
          // A genuine PKCE code, from a flow this browser started itself.
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (window.location.hash.includes('access_token=')) {
          const hash = new URLSearchParams(window.location.hash.slice(1));
          const access_token = hash.get('access_token');
          const refresh_token = hash.get('refresh_token');
          if (access_token && refresh_token) {
            const { error: sessionError } = await client.auth.setSession({ access_token, refresh_token });
            if (sessionError) throw sessionError;
            history.replaceState(null, '', `${location.pathname}${location.search}`);
          }
        }

        const { data } = await client.auth.getSession();
        if (!data.session) {
          // NO TOKEN AND NO SESSION is a different thing from a bad token, and
          // the two used to produce the same sentence. Somebody who opened
          // /join out of curiosity was told their invitation was invalid.
          throw new Error(
            redeeming
              ? 'This invitation link is invalid or has expired. Ask your church to send a new one.'
              : 'Open the link in your invitation e-mail to finish setting up your account.',
          );
        }

        // HAND THE SESSION OVER EXPLICITLY. There are two clients in this app:
        // the auth client, which owns sign-in, and the data client, which reads
        // its token out of local storage through readBrowserSession(). They
        // agree on the storage key and today they agree on the format, so this
        // line is redundant — right up until a library upgrade changes the
        // shape the auth client writes.
        //
        // The cost of being wrong is not an error message. readBrowserSession()
        // returns null when it cannot parse what it finds, the profile read
        // then fails, and this screen concludes the person is unapproved and
        // shows them a waiting room. Silently telling an approved member they
        // are not approved is the single worst outcome this file can produce,
        // and it is one library bump away. So the session is written in the
        // exact shape the data client expects, by us, here.
        saveBrowserSession(data.session);

        const mine = await live.getMyProfile();
        if (!alive) return;
        setEmail(data.session.user.email ?? '');
        setName(mine?.full_name || String(data.session.user.user_metadata.full_name ?? ''));
        if (mine?.role) setRole(mine.role);
        // The church's own name, so the permission being asked for names who is
        // asking. "I give permission for the church" is not consent to anything.
        try {
          const church = await live.myChurch();
          if (alive && church?.name) setChurchName(church.name);
        } catch {
          /* The name is a courtesy. Not having it must not block joining. */
        }
        await refreshProfile();
      } catch (cause) {
        if (alive) setError(errorText(cause));
      } finally {
        if (alive) setReady(true);
      }
    };
    void establishSession();
    return () => {
      alive = false;
    };
  }, [params, refreshProfile, handover]);

  const isSeeker = role === 'ds';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 10) {
      setError('Use at least 10 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    if (!recovery && !consent) {
      setError('Tick the permission box to continue.');
      return;
    }
    // The database cannot check this — a CHECK constraint may not read the
    // clock — so it is checked here, where the person can see what they typed.
    if (extra.birthday && extra.birthday > new Date().toISOString().slice(0, 10)) {
      setError('That birthday is in the future.');
      return;
    }
    const client = supabaseAuth();
    if (!client) return;
    setBusy(true);
    setError('');
    try {
      const { error: passwordError } = await client.auth.updateUser({
        password,
        data: name.trim() ? { full_name: name.trim() } : undefined,
      });
      if (passwordError) throw passwordError;

      // updateUser can rotate the tokens, so re-publish whatever is current.
      const { data: fresh } = await client.auth.getSession();
      if (fresh.session) saveBrowserSession(fresh.session);

      if (!recovery) {
        await live.updateMyProfile({
          full_name: name.trim() || undefined,
          preferred_contact: extra.preferred_contact.trim() || undefined,
          birthday: isSeeker ? extra.birthday || undefined : undefined,
          gender: isSeeker ? extra.gender.trim() || undefined : undefined,
          life_status: isSeeker ? extra.life_status.trim() || undefined : undefined,
          city_of_residence: isSeeker ? extra.city_of_residence.trim() || undefined : undefined,
          work_industry: isSeeker ? extra.work_industry.trim() || undefined : undefined,
          topics_of_interest: isSeeker
            ? extra.topics.split(',').map((t) => t.trim()).filter(Boolean)
            : undefined,
          consent_at: new Date().toISOString(),
        });
      } else if (name.trim()) {
        await live.updateMyProfile({ full_name: name.trim() });
      }

      // SIGN-UP IS FINISHED HERE, AND NOWHERE EARLIER. The account row exists
      // from the moment the invitation was sent, and the sign-in stamp is set
      // by opening the link, so both are true for somebody who has done
      // nothing. This is the first step that needed the invited person to be
      // present, so this is what the church's Invitations screen counts as
      // arriving.
      try {
        await live.finishMySignup();
      } catch {
        /* A missed stamp shows them as still waiting, which is recoverable.
           Failing the sign-up over it is not. */
      }

      const mine = await refreshProfile();
      // THREE OUTCOMES, NOT TWO. The version of this line that read
      // `if (mine?.is_approved) … else waitingRoom` collapsed "we could not
      // read your profile" into "you are not approved", which is how somebody
      // whose Director invited them personally ends up staring at a waiting
      // room. A read that failed is an error and says so.
      if (!mine) throw new Error('Your account was created, but we could not load it. Please sign in.');
      if (mine.is_approved) router.replace(homeFor(mine.role));
      else setDonePending(true);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-white" style={{ backgroundColor: NAVY }}>Checking your secure link…</div>;
  }

  // Somebody is already signed in on this device. Nothing has been redeemed
  // and nobody has been signed out — that only happens if they choose it here.
  if (signedInAs) {
    return (
      <div className="min-h-screen">
        <PublicHeader
          title="Whose invitation is this?"
          subtitle="Someone is already signed in on this device."
        />
        <div className="mx-auto max-w-md px-4 pb-32 pt-8">
          <Card className="p-5">
            <p className="text-gray-700">
              This device is signed in as <strong className="text-navy">{signedInAs}</strong>.
            </p>
            <p className="mt-3 text-gray-700">
              An invitation link sets up the account it was sent to. Opening it
              here signs <strong>{signedInAs}</strong> out and starts the invited
              person&rsquo;s sign-up on this device.
            </p>
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              If you sent this invitation and only wanted to check the link
              works, go back. Send the link to the person instead — it works on
              their phone, and opening it yourself uses it up.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="gold" onClick={() => router.replace('/')}>
                Go back — this is not my link
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSignedInAs('');
                  setReady(false);
                  setHandover(true);
                }}
              >
                It is mine — sign {signedInAs} out
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }
  if (donePending) {
    return (
      <div className="min-h-screen">
        <PublicHeader title="Your account is ready" subtitle="One approval remains." />
        <div className="mx-auto max-w-md px-4 py-8">
          <Card className="p-6 text-center">
            <p className="text-gray-600">A Director or Executive Director must approve your account before you enter the app.</p>
            <Link href="/login" className="mt-4 inline-block font-semibold text-navy underline">Go to sign in</Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PublicHeader
        title={recovery ? 'Set a new password' : 'You’re invited to Hope Beacon'}
        subtitle={
          recovery
            ? 'Choose a password only you know.'
            : isSeeker
              ? 'Someone from your church will walk with you, at whatever pace suits you.'
              : 'Your church has already chosen your role. Confirm your details to get started.'
        }
      />
      {/* pb-32, not py-8: the install banner is fixed to the bottom of the
          viewport, and the join button is the last thing on this page. */}
      <div className="mx-auto max-w-md px-4 pb-32 pt-8">
        <Card className="p-5">
          {error && !email ? (
            <>
              <Notice tone="error">{error}</Notice>
              <p className="mt-3 text-sm text-gray-500">
                Invitations work once, and only the most recent one works. Check your
                inbox for the newest message before asking for another, because a new
                invitation switches off the one you already have.
              </p>
              <Link href="/login" className="mt-4 inline-block font-semibold text-navy underline">Go to sign in</Link>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {/* Read-only, because it is the address the invitation was sent
                  to. An editable box here would let somebody redirect an
                  invitation that was not addressed to them. */}
              <label className="block">
                <span className="text-sm font-semibold text-gray-600">Email</span>
                <input
                  readOnly
                  value={email}
                  aria-describedby="join-email-why"
                  className="tap mt-1 w-full cursor-not-allowed rounded-xl bg-gray-100 px-4 text-base text-gray-500 outline-none"
                />
                <span id="join-email-why" className="mt-1 block text-xs text-gray-400">
                  This is the address your invitation was sent to.
                </span>
              </label>

              {!recovery && (
                <label className="block">
                  <span className="text-sm font-semibold text-gray-600">Your name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
                    required
                  />
                </label>
              )}

              <label className="block">
                <span className="text-sm font-semibold text-gray-600">
                  {recovery ? 'New password' : 'Choose a password'}
                </span>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={10}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="tap w-full rounded-xl bg-gray-100 pl-4 pr-12 text-lg outline-none focus:ring-2 focus:ring-gold"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center text-gray-500"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                <span className="mt-1 block text-xs text-gray-400">At least 10 characters.</span>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-600">Confirm password</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={10}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
                  required
                />
              </label>

              {!recovery && (
                <>
                  {/* PERMISSION. Named church, plain words, and the OBLIGATION
                      stated in the same breath as the request, because that is
                      what is actually being agreed to here.
                      This used to promise "I can withdraw this at any time from
                      Settings, and my details are removed when I do", and
                      Settings had the button behind it. Both went together in
                      the same commit: keeping the sentence after removing the
                      button would have made the app lie at the exact moment it
                      asks somebody to trust it. Unticked by default -- a box
                      that arrives already ticked is not consent, it is a
                      default nobody noticed. */}
                  <label className="flex items-start gap-3 rounded-xl bg-navy/5 p-4">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      className="mt-1 h-5 w-5 shrink-0"
                    />
                    <span className="text-sm leading-relaxed text-gray-700">
                      I give permission for <strong>{churchName || 'my church'}</strong> to
                      keep my contact details so someone from the church can stay in touch
                      with me about my studies. I can update them whenever I need to, I
                      will keep them truthful, and my Guide and my church&rsquo;s
                      leadership can see when I change them.{' '}
                      <span className="text-red-600">*</span>
                    </span>
                  </label>

                  {isSeeker && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowMore((v) => !v)}
                        className="text-sm font-semibold text-navy underline"
                      >
                        {showMore
                          ? 'Hide the optional questions'
                          : 'Tell your Guide a little more (optional)'}
                      </button>
                      {showMore && (
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <JoinField
                            label="Preferred contact"
                            value={extra.preferred_contact}
                            onChange={setExtraField('preferred_contact')}
                            placeholder="Phone, Messenger…"
                          />
                          <JoinField
                            label="Birthday"
                            type="date"
                            value={extra.birthday}
                            onChange={setExtraField('birthday')}
                          />
                          <JoinField label="Gender" value={extra.gender} onChange={setExtraField('gender')} />
                          <JoinField label="Status" value={extra.life_status} onChange={setExtraField('life_status')} />
                          <JoinField
                            label="City of residence"
                            value={extra.city_of_residence}
                            onChange={setExtraField('city_of_residence')}
                          />
                          <JoinField
                            label="Work / Industry"
                            value={extra.work_industry}
                            onChange={setExtraField('work_industry')}
                          />
                          <JoinField
                            label="Topics of interest"
                            value={extra.topics}
                            onChange={setExtraField('topics')}
                            placeholder="Comma-separated"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {error && <Notice tone="error">{error}</Notice>}
              <Button
                type="submit"
                variant="gold"
                className="w-full"
                disabled={busy || (!recovery && !consent)}
              >
                {busy ? 'Saving…' : recovery ? 'Save new password' : 'Join Hope Beacon →'}
              </Button>
              {!recovery && !consent && (
                <p className="text-xs text-gray-500">Tick the permission box above to continue.</p>
              )}
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

function JoinField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-gold"
      />
    </label>
  );
}

export function LiveAdminPage() {
  const { profile } = useLiveSession();
  const [members, setMembers] = useState<Profile[]>([]);
  const [pairings, setPairings] = useState<live.PairingView[]>([]);
  const [church, setChurch] = useState<live.Church | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('dm');
  const [guideId, setGuideId] = useState('');
  const [dmId, setDmId] = useState('');
  const [dsId, setDsId] = useState('');
  const [busy, setBusy] = useState('');
  // Set when the invitation could not be emailed and must be passed on by hand.
  const [handLink, setHandLink] = useState<{ to: string; url: string; why: string; wait?: number } | null>(null);
  // '' not tried, 'yes' copied, 'failed' the clipboard refused. Safari rejects
  // the write when the document is not focused, and navigator.clipboard does
  // not exist at all over plain http. The link is in a selectable box right
  // above, so a failure has somewhere useful to point.
  const [linkCopied, setLinkCopied] = useState<'' | 'yes' | 'failed'>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextMembers, nextPairings, nextChurch] = await Promise.all([
        live.listMembers(),
        live.listPairings(),
        live.myChurch(),
      ]);
      setMembers(nextMembers);
      setPairings(nextPairings);
      setChurch(nextChurch);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roleOptions: Role[] = profile?.role === 'executive' ? ['admin', 'dm', 'ds'] : ['dm', 'ds'];
  const guides = members.filter((member) => member.role === 'dm' && member.is_approved);
  const explorers = members.filter((member) => member.role === 'ds' && member.is_approved);
  const manageable = members.filter(
    (member) => member.id !== profile?.id && roleOptions.includes(member.role),
  );
  const pending = manageable.filter((member) => !member.is_approved);
  const approved = manageable.filter((member) => member.is_approved);
  // Directors are their own room, and only an Executive has one. A Director
  // does not manage other Directors, so showing them the tab would be a room
  // with nothing they can do in it.
  const directors = members.filter((member) => member.role === 'admin' && member.is_approved);
  const isExec = profile?.role === 'executive';

  // ROOMS, IN THE ORDER A DIRECTOR ACTUALLY WORKS. See docs/DESIGN.md rule 1:
  // the room needed most often is the first one. Pairing and approving happen
  // weekly; the board report is read once a month. Pairing used to be the ninth
  // section down one long page.
  const rooms: Room[] = [
    { id: 'pairings', label: 'Pairings', badge: pairings.filter((x) => x.status === 'active').length },
    { id: 'approvals', label: 'Approvals', badge: pending.length, urgent: pending.length > 0 },
    { id: 'guides', label: 'Guides', badge: guides.length },
    { id: 'explorers', label: 'Explorers', badge: explorers.length },
    ...(isExec ? [{ id: 'directors', label: 'Directors', badge: directors.length }] : []),
    { id: 'lessons', label: 'Lessons' },
    { id: 'safeguarding', label: 'Safeguarding' },
    { id: 'church', label: 'Church' },
  ];
  // Stored per role, so a Director and an Executive keep their own places.
  const [room, chooseRoom] = useRoom(rooms, `beacon-admin-room:${profile?.role ?? 'admin'}`);

  useEffect(() => {
    if (!roleOptions.includes(role)) setRole(roleOptions[0]);
  }, [roleOptions, role]);

  const sendInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !emailLooksValid(email)) return;
    setBusy('invite');
    setError('');
    setNotice('');
    try {
      const result = await live.inviteMember({
        fullName: name,
        email,
        role,
        recommendedBy: role === 'ds' && guideId ? guideId : undefined,
      });
      const to = email.trim().toLowerCase();

      // TELL THE TRUTH ABOUT WHAT HAPPENED. This said "Invitation e-mail sent"
      // unconditionally, including when the function had reported that it could
      // not send anything. Invitations went nowhere for a day while the screen
      // said they had gone — and the one thing that would have made it obvious,
      // the link the function hands back for exactly this case, was thrown away
      // one layer down.
      if (result.delivery === 'link' && result.link) {
        setHandLink({ to, url: result.link, why: result.mailNote ?? '', wait: result.waitSeconds });
        setNotice('');
      } else {
        // KEEP THE LINK ON SCREEN EVEN ON SUCCESS. Supabase builds the link in
        // its own email from the project's Site URL, and if the app's address
        // is not in the Redirect URLs allow-list that is silently ignored — a
        // project on its defaults mails everybody a link to localhost:3000. The
        // send reports success, the link is useless, and nothing in the result
        // says so. This link is built by our own invite function from the
        // church's own configured address, so it is correct whatever the
        // provider dashboard holds.
        setHandLink(result.link ? { to, url: result.link, why: 'sent' } : null);
        // Say WHERE it went and BY WHICH ROUTE. "Sent" on its own is the
        // message this screen showed all day while nothing was being sent, so
        // it has to carry something only a real send could produce.
        const how = result.via === 'supabase'
          ? ' It went through Supabase\u2019s own mail service, so it will look plain.'
          : '';
        setNotice(
          (result.resent
            ? `\u2713 Invitation link re-sent to ${to}.`
            : `\u2713 Invitation link sent to ${to}.`) + how,
        );
      }
      setName('');
      setEmail('');
      setGuideId('');
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy('');
    }
  };

  const approve = async (member: Profile) => {
    setBusy(member.id);
    setError('');
    try {
      await live.approveMember(member.id, member.role);
      setNotice(`${member.full_name || 'Member'} approved as ${roleNoun(member.role)}.`);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy('');
    }
  };

  const disapprove = async (member: Profile) => {
    if (!window.confirm(`Disapprove ${member.full_name || 'this account'}? They will lose workspace access until approved again.`)) return;
    setBusy(member.id);
    setError('');
    setNotice('');
    try {
      await live.disapproveMember(member.id);
      setNotice(`${member.full_name || 'Member'} no longer has workspace access.`);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy('');
    }
  };

  const pair = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dmId || !dsId) return;
    setBusy('pair');
    setError('');
    try {
      await live.createPairing(dmId, dsId, 'digital');
      setNotice('Guide and Explorer paired at Connect.');
      setDmId('');
      setDsId('');
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy('');
    }
  };

  return (
    <LiveAppShell allow={['admin', 'executive']}>
      <div className="space-y-4">
        {/* SMALLER THAN IT WAS, and the sentence under it is gone. It read
            "Invite, approve, disapprove and pair people", which is exactly what
            the room names below now say, and it said it again on every visit.
            On a 664px phone that block plus the header spent 300px before a
            Director could reach anything they came to do. */}
        <h1 className="text-2xl font-extrabold text-navy sm:text-3xl">
          {church?.name || 'Church administration'}
        </h1>

        {/* THE ROOMS COME FIRST, above even a safeguarding alert, and that
            ordering is deliberate. docs/DESIGN.md rule 1: the second visit
            should be faster than the first, which only works if the way around
            the building is in the same place every time. Put an alert above
            them and the tabs move down on the days something is wrong -- which
            are the days a Director can least afford to go looking. */}
        <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />

        {error && <Notice tone="error">{error}</Notice>}
        {notice && <Notice tone="success">{notice}</Notice>}

        {/* ABOVE THE ADMIN WORK, NOT BELOW IT. A safeguarding report that sits
            under invitations and pairings gets read at the pace of invitations
            and pairings. It renders nothing at all when there is nothing open,
            so it costs a Director no attention on an ordinary day. */}
        <LiveReportsForDirector
          onRemove={async (id, who) => {
            if (!confirm(`Remove ${who} from the church? They lose access immediately.`)) return;
            try {
              await live.removeMember(id);
              setNotice(`${who} was removed from the church.`);
              await load();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Could not remove them.');
            }
          }}
        />

        {/* GUIDES AND EXPLORERS ARE SEPARATE ROOMS, not one roll to scroll.
            They are different jobs: a Guide has a load and a cap, an Explorer
            has a Guide and a stage. Reading one long list and sorting people
            in your head is work the app should have done. Directors get their
            own room too, and only an Executive sees it, because a Director does
            not manage other Directors. */}
        {(room === 'guides' || room === 'explorers' || room === 'directors') && (
          <PeopleRoom
            people={room === 'guides' ? guides : room === 'explorers' ? explorers : directors}
            kind={room}
            pairings={pairings}
          />
        )}

        {/* SAFEGUARDING, IN THE ORDER A DIRECTOR MEETS IT: what has been
            reported, then the cases arising from it, then the room where a
            case is opened or somebody is stopped on the spot. Putting the
            trial room first would offer the punishment before the hearing. */}
        {room === 'safeguarding' && profile && <LiveCourt me={profile} />}
        {room === 'safeguarding' && profile && (
          <LiveTrialRoom
            me={profile}
            onCaseOpened={() => {
              // A case opened below appears in Cases above, which loads its own
              // list. Reloading the page data here keeps the member list and the
              // pairing list honest after a suspension archived somebody.
              void load();
            }}
          />
        )}

        {/* Guilds and the church-wide numbers. Both are a Director's job as
            much as an Executive's -- a Director who cannot see their own
            church's totals cannot run it. */}
        {room === 'church' && profile && <LiveGuilds me={profile} />}
        {room === 'church' && <LiveChurchPulse />}

        {/* THE LIBRARY BELONGS TO DIRECTORS TOO.
            The tutorial's Director walk ends on "Stock the library", and live
            it existed only on the Guide's page — so somebody who learned the
            job in the demo signed in and found the last thing they were taught
            was missing. Passing no pairings gives add-and-publish without the
            per-Explorer share buttons, which is right: stocking the shelf is a
            Director's job, handing a book to one person is a Guide's. */}
        {room === 'lessons' && <LiveLibraryForGuide pairings={[]} />}

        {room === 'approvals' && (
        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">Send an invitation e-mail</h2>
          <p className="mt-1 text-sm text-gray-500">The chosen role comes from the server-side invitation record.</p>
          {handLink && (
            // A church that has not set up a mail provider yet is a normal
            // state, and it must not be a dead end. The account and the link
            // are real and work exactly once; the only thing missing is the
            // postman, so the Director becomes the postman.
            <div className={`mt-4 rounded-2xl p-4 ring-1 ${
              handLink.wait
                ? 'bg-blue-50 ring-blue-300'
                : handLink.why === 'sent'
                  ? 'bg-green-50 ring-green-300'
                  : 'bg-amber-50 ring-amber-300'
            }`}>
              {/* A COOLDOWN AND A FAULT ARE DIFFERENT THINGS and must not look
                  the same. One means "wait a moment"; the other means "go and
                  change a setting". Drawn identically, a sixty-second timer
                  reads as the email system failing again. */}
              <p className={`font-bold ${
                handLink.wait ? 'text-blue-900' : handLink.why === 'sent' ? 'text-green-900' : 'text-amber-900'
              }`}>
                {handLink.wait
                  ? `Nearly — wait ${handLink.wait} seconds, then press Send once`
                  : handLink.why === 'sent'
                    ? 'Their link, in case the e-mail does not arrive'
                    : `Send this link to ${handLink.to} yourself`}
              </p>
              <p className={`mt-1 text-sm ${
                handLink.wait ? 'text-blue-800' : handLink.why === 'sent' ? 'text-green-800' : 'text-amber-800'
              }`}>
                {handLink.why === 'sent'
                  ? 'Worth keeping. The app built this one itself, so it is correct even if the address in the e-mail is not.'
                  : handLink.why || 'No email service is set up on this project yet.'}
              </p>
              <p className={`mt-1 text-sm ${
                handLink.wait ? 'text-blue-800' : handLink.why === 'sent' ? 'text-green-800' : 'text-amber-800'
              }`}>
                The account is created and this link works. It can be used once.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={handLink.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`tap min-w-0 flex-1 rounded-xl bg-white px-3 text-sm ring-1 ${
                    handLink.wait
                      ? 'ring-blue-300'
                      : handLink.why === 'sent' ? 'ring-green-300' : 'ring-amber-300'
                  }`}
                />
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const done = await copyText(handLink.url);
                    setLinkCopied(done ? 'yes' : 'failed');
                  }}
                >
                  {linkCopied === 'yes'
                    ? '✓ Copied'
                    : linkCopied === 'failed'
                      ? 'Select the box above'
                      : 'Copy link'}
                </Button>
                <Button variant="ghost" onClick={() => setHandLink(null)}>Done</Button>
              </div>
            </div>
          )}

          <form onSubmit={sendInvite} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Full name" value={name} onChange={setName} />
            <Field label="E-mail" type="email" value={email} onChange={setEmail} />
            <label className="block">
              <span className="text-sm font-semibold text-gray-600">Role</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
                className="tap mt-1 w-full rounded-xl bg-gray-100 px-3 text-base"
              >
                {roleOptions.map((option) => <option key={option} value={option}>{roleNoun(option)}</option>)}
              </select>
            </label>
            {role === 'ds' && (
              <label className="block">
                <span className="text-sm font-semibold text-gray-600">Guide after approval (optional)</span>
                <select
                  value={guideId}
                  onChange={(event) => setGuideId(event.target.value)}
                  className="tap mt-1 w-full rounded-xl bg-gray-100 px-3 text-base"
                >
                  <option value="">Pair later</option>
                  {guides.map((guide) => <option key={guide.id} value={guide.id}>{guide.full_name}</option>)}
                </select>
              </label>
            )}
            <div className="sm:col-span-2">
              <Button
                type="submit"
                variant="gold"
                disabled={busy === 'invite' || !name.trim() || !emailLooksValid(email)}
              >
                {busy === 'invite' ? 'Sending…' : 'Send invitation'}
              </Button>
            </div>
          </form>
        </Card>

        )}

        {room === 'approvals' && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-navy">Approved accounts</h2>
              <p className="text-sm text-gray-500">Disapproval suspends workspace access without deleting the account.</p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">{approved.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {loading ? <p className="text-gray-400">Loading…</p> : approved.length === 0 ? (
              <p className="text-gray-400">No approved accounts to manage.</p>
            ) : approved.map((member) => (
              <div key={member.id} className="flex flex-col gap-3 rounded-xl bg-gray-50 px-4 py-3 sm:flex-row sm:items-center">
                <Avatar name={member.full_name || 'Member'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy">{member.full_name || 'Member'}</p>
                  <p className="text-sm text-gray-500">{roleNoun(member.role)} · access approved</p>
                </div>
                <Button
                  variant="ghost"
                  className="text-red-700"
                  onClick={() => void disapprove(member)}
                  disabled={busy === member.id}
                >
                  Disapprove
                </Button>
              </div>
            ))}
          </div>
        </Card>

        )}

        {room === 'approvals' && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-navy">Awaiting approval</h2>
              <p className="text-sm text-gray-500">Invited people cannot enter their workspace until approved.</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">{pending.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {loading ? <p className="text-gray-400">Loading…</p> : pending.length === 0 ? (
              <p className="text-gray-400">Nobody is waiting.</p>
            ) : pending.map((member) => (
              <div key={member.id} className="flex flex-col gap-3 rounded-xl bg-gray-50 px-4 py-3 sm:flex-row sm:items-center">
                <Avatar name={member.full_name || 'Member'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-navy">{member.full_name || 'Invited member'}</p>
                  <p className="text-sm text-gray-500">Invited as {roleNoun(member.role)}</p>
                </div>
                <Button onClick={() => void approve(member)} disabled={busy === member.id}>Approve</Button>
              </div>
            ))}
          </div>
        </Card>

        )}

        {room === 'pairings' && (
        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">Pair a Guide and Explorer</h2>
          <form onSubmit={pair} className="mt-4 grid gap-3 sm:grid-cols-2">
            <SelectPerson label="Guide" value={dmId} onChange={setDmId} people={guides} />
            <SelectPerson
              label="Explorer"
              value={dsId}
              onChange={setDsId}
              people={explorers.filter((explorer) => !pairings.some((p) => p.ds_id === explorer.id && p.status === 'active'))}
            />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy === 'pair' || !dmId || !dsId}>Create pairing</Button>
            </div>
          </form>

          <div className="mt-5 space-y-2">
            {pairings.filter((pairing) => pairing.status === 'active').map((pairing) => (
              <div key={pairing.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                <span className="font-semibold text-navy">{pairing.dm_name}</span>
                <span className="text-gray-400">walking with</span>
                <span className="font-semibold text-navy">{pairing.ds_name}</span>
                <MinorBadge person={{ birthday: pairing.ds_birthday, guardian_consent_at: pairing.ds_guardian_consent_at }} />
                <span className="ml-auto rounded-full bg-white px-3 py-1 font-semibold text-gray-600">{stageInfo(pairing.journey_stage).label}</span>
                {/* UNPAIR. A pairing could be made and never unmade, so a wrong
                    one could only be corrected in SQL. Archiving rather than
                    deleting keeps the conversation history intact -- the two
                    people simply stop being connected. */}
                <Button
                  variant="ghost"
                  disabled={busy === `unpair-${pairing.id}`}
                  onClick={() => {
                    if (!confirm(
                      `Disconnect ${pairing.dm_name} from ${pairing.ds_name}? `
                      + 'Their conversation is kept, but they stop walking together.',
                    )) return;
                    void (async () => {
                      setBusy(`unpair-${pairing.id}`);
                      setError('');
                      try {
                        await live.endPairing(pairing.id);
                        setNotice(`${pairing.dm_name} and ${pairing.ds_name} are no longer paired.`);
                        await load();
                      } catch (cause) {
                        setError(errorText(cause));
                      } finally {
                        setBusy('');
                      }
                    })();
                  }}
                >
                  Disconnect
                </Button>
              </div>
            ))}
          </div>
        </Card>
        )}

        {/* The numbers first: a leader opens this to find out how the ministry
            is going, not to administer one more person. */}
        {room === 'church' && <LiveChurchOverview />}

        {/* The WALL, not the named requests. A Director is shown totals and
            never an identity; one who needs to know how a particular person is
            doing asks their Guide. prayer_wall() returns no identifier at all,
            so there is nothing to read even in the raw response.

            Worth stating because it was once reported as a bug — "the admin
            cannot see the prayer" — when it was the design working. */}
        {room === 'approvals' && <LiveRecommendationsForDirector />}
        {room === 'lessons' && <LiveLessonSeries manage />}
        {room === 'church' && <LivePrayerWall />}
        {room === 'church' && <LiveBoardReport churchName={church?.name} />}
      </div>
    </LiveAppShell>
  );
}

export function LiveGuidePage() {
  const { profile } = useLiveSession();
  const [rows, setRows] = useState<live.PairingView[]>([]);
  const [error, setError] = useState('');
  // WHO HAS ASKED FOR PRAYER, on the card, before anything else.
  //
  // The requests were already on this page — but below Recommend, Follow-ups,
  // Lesson series and the Library, which is a long way down on a phone. Asking
  // for prayer is the most exposed thing an Explorer does here, and the list a
  // Guide actually looks at said nothing about it. Somebody writes "please pray
  // for my mother" and, as far as they can tell, nothing happens.
  //
  // `open` only: the badge clears once the Guide presses "I'm praying", which
  // is what keeps it worth reading rather than permanent furniture.
  const [unprayed, setUnprayed] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    live.listPairings().then((data) => { if (alive) setRows(data.filter((row) => row.status === 'active')); }).catch((cause) => { if (alive) setError(errorText(cause)); });
    live.listPrayerRequests().then((requests) => {
      if (!alive) return;
      const counts: Record<string, number> = {};
      for (const r of requests) {
        if (r.status !== 'open') continue;
        counts[r.ds_id] = (counts[r.ds_id] ?? 0) + 1;
      }
      setUnprayed(counts);
    }).catch(() => {
      /* The badge is an aid, not the feature. A Guide who cannot load it still
         has the full list further down the page, so this must not take the
         whole screen down with it. */
    });
    return () => { alive = false; };
  }, []);

  return (
    <LiveAppShell allow={['dm']}>
      <h1 className="text-3xl font-extrabold text-navy">My Explorers</h1>
      <p className="mt-1 text-gray-500">Only people paired with you appear here.</p>
      {error && <div className="mt-5"><Notice tone="error">{error}</Notice></div>}

      {/* A Guide called into a case must be able to answer it. LiveCourt draws
          nothing at all when there are no cases, so on an ordinary day this
          costs the page nothing. */}
      {profile && <div className="mt-6"><LiveCourt me={profile} /></div>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {rows.map((row) => {
          const stage = stageInfo(row.journey_stage);
          return (
            <Link key={row.id} href={`/dm/${row.id}`}>
              <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <Avatar name={row.ds_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-lg font-bold text-navy">{row.ds_name}</p>
                      {/* The Guide is the adult in the room, so they see this
                          and not only a Director. Drawn next to the name rather
                          than tucked into the profile, because a safeguarding
                          mark you have to go looking for is one nobody sees. */}
                      <MinorBadge person={{ birthday: row.ds_birthday, guardian_consent_at: row.ds_guardian_consent_at }} />
                    </div>
                    {unprayed[row.ds_id] ? (
                      <p className="text-sm font-semibold" style={{ color: '#7C3AED' }}>
                        🙏 asked for prayer
                        {unprayed[row.ds_id] > 1 ? ` ×${unprayed[row.ds_id]}` : ''}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">{row.track} path</p>
                    )}
                  </div>
                  <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: `${stage.color}20`, color: stage.color }}>{stage.label}</span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      {rows.length === 0 && !error && <Card className="mt-6 p-6 text-center text-gray-500">No active pairing yet.</Card>}

      <div className="mt-6 space-y-6">
        <LiveRecommend />
        <LiveFollowUps pairings={rows.map((r) => ({ id: r.id, ds_name: r.ds_name }))} />
        <LiveLessonSeries />
      </div>

      {/* The library, with a share button per Explorer. Links rather than
          files, so what arrives actually opens on their phone. */}
      <div className="mt-6">
        <LiveLibraryForGuide pairings={rows.map((r) => ({ id: r.id, ds_name: r.ds_name }))} />
      </div>

      {/* Named requests from their own Explorers, then the nameless wall the
          rest of the church sees. Both, because a Guide is also a member. */}
      <div className="mt-6 space-y-6">
        <LivePrayerForGuide nameFor={(id) => rows.find((r) => r.ds_id === id)?.ds_name ?? 'An Explorer'} />
        <LivePrayerWall />
      </div>

      {/* Last on the page on purpose: the people waiting on this Guide come
          first, and writing is what you do once everyone is answered. */}
      <div className="mt-6"><LiveBlogDesk /></div>
    </LiveAppShell>
  );
}

// WHAT THIS PERSON HAS CHANGED ABOUT THEMSELVES.
//
// The app no longer offers a way to erase your details; it asks you to keep
// them true instead, and tells the people walking with you when they move. That
// undertaking is worth nothing if the change is invisible, so this is the half
// that makes it real.
//
// COLLAPSED BY DEFAULT, AND ABSENT WHEN THERE IS NOTHING. A Guide opens this
// screen to talk to somebody, not to audit them, and a permanent panel headed
// "changes" turns a conversation into a file. It appears only when something
// actually changed, and shows the newest three until asked for more.
//
// The values are shown in full rather than masked. A Guide who can see the
// current phone number gains nothing from having the previous one starred out,
// and "changed from ****** to ******" answers none of the questions that make
// this worth having.
function DetailChanges({ personId, firstName }: { personId: string; firstName: string }) {
  const [rows, setRows] = useState<live.ProfileChange[] | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let alive = true;
    live.listProfileChanges(personId)
      .then((r) => { if (alive) setRows(r); })
      // A refusal and an empty history look the same from here, and both mean
      // "nothing to show". Neither is worth an error box on a chat screen.
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [personId]);

  if (!rows || rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, 3);

  return (
    <Card className="p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
        What {firstName} has updated
      </h2>
      <ul className="mt-2 space-y-2">
        {shown.map((row) => (
          <li key={row.id} className="text-sm text-gray-700">
            <span className="font-semibold text-navy">
              {live.PROFILE_FIELD_LABEL[row.field] ?? row.field}
            </span>{' '}
            <span className="text-gray-400 line-through">{row.old_value || 'blank'}</span>
            {' \u2192 '}
            <span className="font-medium">{row.new_value || 'blank'}</span>
            <span className="ml-2 text-xs text-gray-400">
              {new Date(row.changed_at).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > 3 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-3 text-sm font-semibold text-navy underline"
        >
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </Card>
  );
}

export function LiveConversationPage() {
  const params = useParams();
  const pairingId = String(params.id);
  const { profile } = useLiveSession();
  const [pairing, setPairing] = useState<live.PairingView | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<live.PairingFile[]>([]);
  // Unsent text survives leaving this screen, and is never sent anywhere until
  // the person presses Send. See lib/drafts.ts.
  const [body, setBody] = useDraft(pairingId);
  const [error, setError] = useState('');
  const [attachError, setAttachError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pairs, nextMessages, nextFiles] = await Promise.all([
        live.listPairings(),
        live.listMessages(pairingId),
        // Never allowed to take the conversation down with it: a church whose
        // storage is misconfigured must still be able to talk.
        live.listPairingFiles(pairingId).catch(() => [] as live.PairingFile[]),
      ]);
      setPairing(pairs.find((pair) => pair.id === pairingId) ?? null);
      setMessages(nextMessages);
      setFiles(nextFiles);
      await live.markRead(pairingId);
    } catch (cause) {
      setError(errorText(cause));
    }
  }, [pairingId]);

  const attach = useCallback(async (chosen: File) => {
    setAttachError('');
    setBusy(true);
    try {
      await live.sendPairingFile(pairingId, chosen);
      await load();
    } catch (cause) {
      setAttachError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }, [pairingId, load]);

  const dropFile = useCallback(async (file: live.PairingFile) => {
    setAttachError('');
    try {
      await live.removePairingFile(file);
      await load();
    } catch (cause) {
      setAttachError(errorText(cause));
    }
  }, [load]);

  useEffect(() => {
    void load();
    return live.subscribeToMessages(pairingId, () => void load());
  }, [pairingId, load]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      await live.sendMessage(pairingId, body);
      // Clear the stored draft NOW rather than leaving it to the debounce. A
      // Guide who sends and immediately taps back unmounts the composer inside
      // the debounce window, which cancels the pending write — and the draft of
      // the message they just sent would still be sitting there next time.
      clearDraft(pairingId);
      setBody('');
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    setBusy(true);
    setError('');
    try {
      await live.advanceStage(pairingId);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <LiveAppShell allow={['dm']}>
      {!pairing ? <Card className="p-6">This Explorer is not on your list.</Card> : (
        <div className="space-y-5">
          <Link href="/dm" className="text-navy underline">← My Explorers</Link>
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={pairing.ds_name} size={52} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-extrabold text-navy">{pairing.ds_name}</h1>
                  {/* The screen a Guide spends their time on. If the badge is
                      anywhere, it is here: this is where the conversation
                      happens and where knowing you are talking to a child
                      changes how you write. */}
                  <MinorBadge person={{ birthday: pairing.ds_birthday, guardian_consent_at: pairing.ds_guardian_consent_at }} />
                </div>
                <p className="text-sm text-gray-500">Private conversation</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-navy">{stageInfo(pairing.journey_stage).label}</span>
              <Button onClick={() => void advance()} disabled={busy || pairing.journey_stage === 'commission'}>Advance stage</Button>
            </div>
          </Card>
          {error && <Notice tone="error">{error}</Notice>}
          {/* THE PRAYER REQUESTS, HERE, not only on the dashboard.
              Asking for prayer is the most exposed thing an Explorer does in
              this app, and the answer to it was one screen away from where the
              Guide actually sits. Somebody wrote what they needed prayer for,
              their Guide replied to messages all evening on a phone, and never
              saw it -- which came back as "the Guide cannot see prayer
              requests". The row was always there and always readable; it was
              just never in front of them. */}
          <LivePrayerForGuide
            onlyFor={pairing.ds_id}
            nameFor={() => pairing.ds_name}
            heading={`What ${pairing.ds_name.split(' ')[0]} has asked prayer for`}
          />

          <DetailChanges
            personId={pairing.ds_id}
            firstName={pairing.ds_name.split(' ')[0]}
          />

          <Conversation
            messages={messages}
            files={files}
            myId={profile?.id ?? ''}
            body={body}
            setBody={setBody}
            send={send}
            busy={busy}
            onAttach={(chosen) => void attach(chosen)}
            onRemoveFile={(file) => void dropFile(file)}
            attachError={attachError}
          />
          {/* Reporting runs BOTH ways. A Guide receiving something they should
              not have received needs this as much as an Explorer does, and a
              route only the junior party can use is one nobody uses. */}
          <LiveReportControl
            subjectId={pairing.ds_id}
            subjectName={pairing.ds_name}
            pairingId={pairing.id}
          />
        </div>
      )}
    </LiveAppShell>
  );
}

export function LiveExplorerPage() {
  const { profile } = useLiveSession();
  const [pairing, setPairing] = useState<live.MyPairing | null>(null);
  const [files, setFiles] = useState<live.PairingFile[]>([]);
  const [attachError, setAttachError] = useState('');
  // The attach handler is created once and would otherwise capture whatever
  // `pairing` was at that render — null, on the first one. A ref reads the
  // current value at the moment the file is chosen.
  const pairingRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // `pairing` is null until it loads, so the draft has nothing to key on for the
  // first render or two. useDraft handles that: the box is simply unsaved until
  // the id arrives, and the draft appears the moment it does.
  const [body, setBody] = useDraft(pairing?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const mine = await live.getMyPairing();
      setPairing(mine);
      if (mine) {
        setMessages(await live.listMessages(mine.id));
        // The Explorer sends files too. A route only the Guide can use turns a
        // conversation into a broadcast.
        setFiles(await live.listPairingFiles(mine.id).catch(() => [] as live.PairingFile[]));
        await live.markRead(mine.id);
      }
    } catch (cause) {
      setError(errorText(cause));
    }
  }, []);

  const attach = useCallback(async (chosen: File) => {
    const id = pairingRef.current;
    if (!id) return;
    setAttachError('');
    setBusy(true);
    try {
      await live.sendPairingFile(id, chosen);
      await load();
    } catch (cause) {
      setAttachError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }, [load]);

  const dropFile = useCallback(async (file: live.PairingFile) => {
    setAttachError('');
    try {
      await live.removePairingFile(file);
      await load();
    } catch (cause) {
      setAttachError(errorText(cause));
    }
  }, [load]);

  useEffect(() => { void load(); }, [load]);
  const pairingId = pairing?.id;
  useEffect(() => { pairingRef.current = pairingId ?? null; }, [pairingId]);
  useEffect(
    () => pairingId ? live.subscribeToMessages(pairingId, () => void load()) : undefined,
    [pairingId, load],
  );

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pairing || !body.trim()) return;
    setBusy(true);
    setError('');
    try {
      await live.sendMessage(pairing.id, body);
      clearDraft(pairing.id);
      setBody('');
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <LiveAppShell allow={['ds']}>
      <div className="space-y-5">
        <div className="rounded-2xl p-6 text-white" style={{ background: `linear-gradient(135deg, ${NAVY}, #2F80ED)` }}>
          <p className="text-white/70">Welcome,</p>
          <h1 className="text-3xl font-extrabold">{profile?.full_name.split(' ')[0]}</h1>
          <p className="mt-3 text-white/80">Your journey is a relationship, not a score.</p>
        </div>
        {error && <Notice tone="error">{error}</Notice>}

        {/* An Explorer called into a case is the person with the least standing
            in it, so their answer has to be reachable on their own home screen
            rather than somewhere they would have to be told about. It draws
            nothing when there are no cases.

            They can post here even while suspended, on purpose: suspending
            somebody pending a hearing must not take away their side of it. */}
        {profile && <LiveCourt me={profile} />}

        {!pairing ? (
          <Card className="p-6 text-center">
            <h2 className="text-xl font-bold text-navy">Your Guide is being arranged</h2>
            <p className="mt-2 text-gray-500">Your church will connect one person with you soon.</p>
          </Card>
        ) : (
          <>
            <Card className="p-5">
              <p className="text-sm text-gray-500">Walking with you</p>
              <p className="mt-1 text-xl font-bold text-navy">{pairing.dm_name}</p>
              <p className="mt-2 text-sm text-gray-500">Only you and your Guide can read this conversation.</p>
            </Card>
            <Conversation
              messages={messages}
              files={files}
              myId={profile?.id ?? ''}
              body={body}
              setBody={setBody}
              send={send}
              busy={busy}
              onAttach={(chosen) => void attach(chosen)}
              onRemoveFile={(file) => void dropFile(file)}
              attachError={attachError}
            />
            {/* THE ONE THAT MATTERS MOST. The Explorer is the person with the
                least standing in this relationship and the most reason to stay
                silent, so their route out has to be on the same screen as the
                conversation itself — not in a menu, not in settings. */}
            <LiveReportControl
              subjectId={pairing.dm_id}
              subjectName={pairing.dm_name}
              pairingId={pairing.id}
            />
          </>
        )}

        {/* Below the conversation, because a message addressed to you matters
            more than one addressed to everybody. Renders nothing at all when
            there is nothing to read, rather than an empty card. */}
        <LiveSharedWithMe />
        <LiveLessonSeries />
        <LiveBlogFeed selfId={profile?.id} />
        <LiveAskForPrayer />
        <LivePrayerWall />
      </div>
    </LiveAppShell>
  );
}

/**
 * One thing in the conversation, whichever kind it is.
 *
 * ONE LIST, SORTED BY TIME — learned the hard way on the demo side, where
 * messages and attachments were two separate render passes and every file drew
 * at the bottom however long ago it was sent. The timestamps said one thing and
 * the order said another. Live never had attachments to get this wrong with; it
 * is built this way from the start so it never can.
 */
type Entry =
  | { kind: 'message'; id: string; at: string; who: string; message: Message }
  | { kind: 'file'; id: string; at: string; who: string; file: live.PairingFile };

function Conversation({
  messages,
  files,
  myId,
  body,
  setBody,
  send,
  busy,
  onAttach,
  onRemoveFile,
  attachError,
}: {
  messages: Message[];
  files: live.PairingFile[];
  myId: string;
  body: string;
  setBody: (value: string) => void;
  send: (event: React.FormEvent) => void;
  busy: boolean;
  onAttach?: (file: File) => void;
  onRemoveFile?: (file: live.PairingFile) => void;
  attachError?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const timeline: Entry[] = [
    ...messages.map((m): Entry => ({
      kind: 'message', id: m.id, at: m.created_at, who: m.sender_id, message: m,
    })),
    ...files.map((f): Entry => ({
      kind: 'file', id: f.id, at: f.created_at, who: f.owner_id, file: f,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  return (
    <Card className="overflow-hidden">
      {/* `dvh`, not `vh`. `vh` is the layout viewport, which does not shrink
          when a phone's on-screen keyboard opens — so the thread kept its full
          height and the message you had just written sat underneath the
          keyboard. `dvh` is the part actually visible. The plain `vh` line
          stays underneath it for anything too old to know `dvh`. */}
      <div className="max-h-[55vh] min-h-72 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-5 [max-height:55dvh]">
        {timeline.length === 0 && <p className="py-16 text-center text-gray-400">Start with a welcome.</p>}
        {timeline.map((entry) => {
          const mine = entry.who === myId;
          return (
            <div key={`${entry.kind}-${entry.id}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? 'bg-navy text-white' : 'bg-gray-100 text-gray-800'}`}>
                {entry.kind === 'message' ? (
                  <p className="whitespace-pre-wrap break-words">
                    <Linked text={entry.message.body} />
                  </p>
                ) : (
                  <LiveAttachment
                    file={entry.file}
                    mine={mine}
                    onRemove={mine && onRemoveFile ? () => onRemoveFile(entry.file) : undefined}
                  />
                )}
                <p className={`mt-1 text-[11px] ${mine ? 'text-white/50' : 'text-gray-400'}`}>
                  {new Date(entry.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {attachError && (
        <p className="border-t border-black/5 bg-red-50 px-4 py-2 text-sm text-red-800">{attachError}</p>
      )}

      <form onSubmit={send} className="flex items-end gap-2 border-t border-black/5 p-3 sm:p-4">
        {onAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                // NOT reset here: WebKit invalidates a File once its input is
                // cleared, and onAttach reads the bytes asynchronously. On
                // Safari and iOS that aborted the upload. The reset moved to
                // the click handler below. See components/Chat.tsx for the
                // whole story; this is the live twin of the same bug.
                const chosen = event.target.files?.[0];
                if (chosen) onAttach(chosen);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              className="shrink-0 px-3"
              disabled={busy}
              onClick={() => {
                // Clear on the way IN, so the same file can be chosen twice
                // without the File being invalidated after it is chosen.
                if (fileRef.current) fileRef.current.value = '';
                fileRef.current?.click();
              }}
              aria-label="Attach a file"
            >
              📎
            </Button>
          </>
        )}
        <MessageBox value={body} onChange={setBody} />
        <Button type="submit" variant="gold" disabled={busy || !body.trim()} className="shrink-0 self-end">Send</Button>
      </form>
    </Card>
  );
}

/**
 * One attachment, opened through a signed URL.
 *
 * The bucket is private, so these have no permanent address — the URL is minted
 * per view and expires in an hour. That is also why it is fetched on the click
 * rather than for every file in the thread at once: a long conversation would
 * otherwise mint dozens of signed URLs nobody opens.
 */
function LiveAttachment({
  file,
  mine,
  onRemove,
}: {
  file: live.PairingFile;
  mine: boolean;
  onRemove?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');

  const open = async () => {
    setBusy(true);
    setFailed('');
    try {
      const url = await live.pairingFileUrl(file.path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setFailed('That file could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const size = file.size >= 1024 * 1024
    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(file.size / 1024))} KB`;

  return (
    <span className="block">
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className={`block break-words text-left font-semibold underline underline-offset-2 ${mine ? 'text-white' : 'text-navy'}`}
      >
        📎 {file.title}
      </button>
      <span className={`block text-[11px] ${mine ? 'text-white/60' : 'text-gray-500'}`}>
        {busy ? 'Opening…' : size}
        {onRemove && (
          <>
            {' · '}
            <button type="button" onClick={onRemove} className="underline underline-offset-2">Remove</button>
          </>
        )}
      </span>
      {failed && <span className={`block text-[11px] ${mine ? 'text-red-200' : 'text-red-600'}`}>{failed}</span>}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
        required
      />
    </label>
  );
}

function SelectPerson({
  label,
  value,
  onChange,
  people,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  people: Profile[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-600">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="tap mt-1 w-full rounded-xl bg-gray-100 px-3 text-base">
        <option value="">Choose {label.toLowerCase()}</option>
        {people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
      </select>
    </label>
  );
}

function Notice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return (
    <p className={`rounded-xl px-4 py-3 text-sm ring-1 ${tone === 'error' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-green-50 text-green-800 ring-green-200'}`}>
      {children}
    </p>
  );
}

// Build-time assertion: this module belongs only to configured deployments.

/**
 * One kind of person, on their own.
 *
 * See docs/DESIGN.md rule 1. Guides and Explorers were a single list a Director
 * scrolled and sorted in their head. They are different jobs and they answer
 * different questions: a Guide has a load and a cap of five, an Explorer has a
 * Guide and a stage. The list that answers neither is the one nobody reads.
 */
function PeopleRoom({
  people,
  kind,
  pairings,
}: {
  people: Profile[];
  kind: 'guides' | 'explorers' | 'directors';
  pairings: live.PairingView[];
}) {
  const active = pairings.filter((p) => p.status === 'active');
  const loadOf = (guideId: string) => active.filter((p) => p.dm_id === guideId).length;
  const guideOf = (explorerId: string) =>
    active.find((p) => p.ds_id === explorerId)?.dm_name ?? null;

  const title = kind === 'guides' ? 'Guides' : kind === 'explorers' ? 'Explorers' : 'Directors';
  const empty =
    kind === 'guides' ? 'No Guides yet. Invite one from Approvals.'
      : kind === 'explorers' ? 'No Explorers yet. Invite one from Approvals.'
        : 'No other Directors in this church.';

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-navy">{title}</h2>
        <span className="rounded-full bg-navy/10 px-3 py-1 text-sm font-bold text-navy">{people.length}</span>
      </div>

      {people.length === 0 ? (
        <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">{empty}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {people.map((person) => {
            const load = kind === 'guides' ? loadOf(person.id) : 0;
            const walking = kind === 'explorers' ? guideOf(person.id) : null;
            return (
              <div key={person.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                <Avatar name={person.full_name || 'Member'} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-semibold text-navy">{person.full_name}</span>
                    <MinorBadge person={person} />
                  </div>
                  {kind === 'explorers' && (
                    // The one thing a Director looks for on this screen. An
                    // Explorer with no Guide has no app, so it is said plainly
                    // and coloured as something to fix rather than a blank.
                    walking
                      ? <p className="text-xs text-gray-500">walking with {walking}</p>
                      : <p className="text-xs font-semibold text-red-700">not yet paired</p>
                  )}
                  {kind === 'directors' && (
                    <p className="text-xs text-gray-500">Director</p>
                  )}
                </div>
                {kind === 'guides' && (
                  // Five is the cap, enforced in the database (migration 0030).
                  // Showing the load against it means a Director can see who
                  // has room without opening anything.
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      load >= 5 ? 'bg-red-100 text-red-800' : 'bg-white text-navy ring-1 ring-black/5'
                    }`}
                    title={load >= 5 ? 'At the cap of five' : `${5 - load} place${5 - load === 1 ? '' : 's'} free`}
                  >
                    {load}/5
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
