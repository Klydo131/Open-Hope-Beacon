'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { NAVY, roleNoun, stageInfo } from '@/lib/brand';
import { homeFor, useLiveSession } from '@/lib/live/session';
import * as live from '@/lib/live/data';
import { supabaseAuth } from '@/lib/supabase/client';
import type { Message, Profile, Role } from '@/lib/types';
import { HopeBeaconMark } from '@/components/HopeBeaconMark';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveBlogDesk, LiveBlogFeed } from '@/components/LiveBlog';
import { LiveAskForPrayer, LivePrayerForGuide, LivePrayerWall } from '@/components/LivePrayer';
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
        <p className="mt-3 text-lg text-white/75">One person, walking with one person.</p>

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
          This live church app is invitation-only. Sign-in uses your e-mail and password;
          the tutorial and sample-data demo are separate.
        </p>

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
      window.location.replace(mine.is_approved ? homeFor(mine.role) : '/login');
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
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
                required
              />
            </label>
            {error && <Notice tone="error">{error}</Notice>}
            {notice && <Notice tone="success">{notice}</Notice>}
            <Button type="submit" variant="gold" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
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

export function LiveJoinPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { refreshProfile } = useLiveSession();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [donePending, setDonePending] = useState(false);
  const [error, setError] = useState('');
  const recovery = params.get('recovery') === '1';

  useEffect(() => {
    let alive = true;
    const establishSession = async () => {
      const client = supabaseAuth();
      if (!client) return;
      try {
        const code = params.get('code');
        const tokenHash = params.get('token_hash');
        if (code) {
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (tokenHash) {
          const kind = params.get('type') === 'recovery' ? 'recovery' : 'invite';
          const { error: otpError } = await client.auth.verifyOtp({ token_hash: tokenHash, type: kind });
          if (otpError) throw otpError;
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
        if (!data.session) throw new Error('This invitation link is invalid or has expired.');
        const mine = await live.getMyProfile();
        if (!alive) return;
        setEmail(data.session.user.email ?? '');
        setName(mine?.full_name || String(data.session.user.user_metadata.full_name ?? ''));
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
  }, [params, refreshProfile]);

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
      if (name.trim()) await live.updateMyProfile({ full_name: name.trim() });
      const mine = await refreshProfile();
      if (mine?.is_approved) router.replace(homeFor(mine.role));
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
        title={recovery ? 'Set a new password' : 'Finish your invitation'}
        subtitle={recovery ? 'Choose a password only you know.' : 'Your church has already chosen your role.'}
      />
      <div className="mx-auto max-w-md px-4 py-8">
        <Card className="p-5">
          {error && !email ? (
            <>
              <Notice tone="error">{error}</Notice>
              <Link href="/signup" className="mt-4 inline-block font-semibold text-navy underline">Invitation help</Link>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">{email}</p>
              {!recovery && (
                <label className="block">
                  <span className="text-sm font-semibold text-gray-600">Full name</span>
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
                <span className="text-sm font-semibold text-gray-600">New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
                  required
                />
                <span className="mt-1 block text-xs text-gray-400">At least 10 characters.</span>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-gray-600">Confirm password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
                  required
                />
              </label>
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" variant="gold" className="w-full" disabled={busy}>
                {busy ? 'Saving…' : recovery ? 'Save new password' : 'Create my account'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
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
      await live.inviteMember({
        fullName: name,
        email,
        role,
        recommendedBy: role === 'ds' && guideId ? guideId : undefined,
      });
      setNotice(`Invitation e-mail sent to ${email.trim().toLowerCase()}.`);
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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold text-navy">{church?.name || 'Church administration'}</h1>
          <p className="mt-1 text-gray-500">Invite, approve, disapprove and pair people. Conversations stay private.</p>
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        {notice && <Notice tone="success">{notice}</Notice>}

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">Send an invitation e-mail</h2>
          <p className="mt-1 text-sm text-gray-500">The chosen role comes from the server-side invitation record.</p>
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
                <span className="ml-auto rounded-full bg-white px-3 py-1 font-semibold text-gray-600">{stageInfo(pairing.journey_stage).label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* The WALL, not the named requests. A Director is shown totals and
            never an identity; one who needs to know how a particular person is
            doing asks their Guide. prayer_wall() returns no identifier at all,
            so there is nothing to read even in the raw response.

            Worth stating because it was once reported as a bug — "the admin
            cannot see the prayer" — when it was the design working. */}
        <LivePrayerWall />
      </div>
    </LiveAppShell>
  );
}

export function LiveGuidePage() {
  const [rows, setRows] = useState<live.PairingView[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    live.listPairings().then((data) => { if (alive) setRows(data.filter((row) => row.status === 'active')); }).catch((cause) => { if (alive) setError(errorText(cause)); });
    return () => { alive = false; };
  }, []);

  return (
    <LiveAppShell allow={['dm']}>
      <h1 className="text-3xl font-extrabold text-navy">My Explorers</h1>
      <p className="mt-1 text-gray-500">Only people paired with you appear here.</p>
      {error && <div className="mt-5"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {rows.map((row) => {
          const stage = stageInfo(row.journey_stage);
          return (
            <Link key={row.id} href={`/dm/${row.id}`}>
              <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <Avatar name={row.ds_name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold text-navy">{row.ds_name}</p>
                    <p className="text-sm text-gray-500">{row.track} path</p>
                  </div>
                  <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: `${stage.color}20`, color: stage.color }}>{stage.label}</span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      {rows.length === 0 && !error && <Card className="mt-6 p-6 text-center text-gray-500">No active pairing yet.</Card>}

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

export function LiveConversationPage() {
  const params = useParams();
  const pairingId = String(params.id);
  const { profile } = useLiveSession();
  const [pairing, setPairing] = useState<live.PairingView | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pairs, nextMessages] = await Promise.all([live.listPairings(), live.listMessages(pairingId)]);
      setPairing(pairs.find((pair) => pair.id === pairingId) ?? null);
      setMessages(nextMessages);
      await live.markRead(pairingId);
    } catch (cause) {
      setError(errorText(cause));
    }
  }, [pairingId]);

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
                <h1 className="truncate text-2xl font-extrabold text-navy">{pairing.ds_name}</h1>
                <p className="text-sm text-gray-500">Private conversation</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-navy">{stageInfo(pairing.journey_stage).label}</span>
              <Button onClick={() => void advance()} disabled={busy || pairing.journey_stage === 'commission'}>Advance stage</Button>
            </div>
          </Card>
          {error && <Notice tone="error">{error}</Notice>}
          <Conversation messages={messages} myId={profile?.id ?? ''} body={body} setBody={setBody} send={send} busy={busy} />
        </div>
      )}
    </LiveAppShell>
  );
}

export function LiveExplorerPage() {
  const { profile } = useLiveSession();
  const [pairing, setPairing] = useState<live.MyPairing | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const mine = await live.getMyPairing();
      setPairing(mine);
      if (mine) {
        setMessages(await live.listMessages(mine.id));
        await live.markRead(mine.id);
      }
    } catch (cause) {
      setError(errorText(cause));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const pairingId = pairing?.id;
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
            <Conversation messages={messages} myId={profile?.id ?? ''} body={body} setBody={setBody} send={send} busy={busy} />
          </>
        )}

        {/* Below the conversation, because a message addressed to you matters
            more than one addressed to everybody. Renders nothing at all when
            there is nothing to read, rather than an empty card. */}
        <LiveBlogFeed selfId={profile?.id} />
        <LiveAskForPrayer />
        <LivePrayerWall />
      </div>
    </LiveAppShell>
  );
}

function Conversation({
  messages,
  myId,
  body,
  setBody,
  send,
  busy,
}: {
  messages: Message[];
  myId: string;
  body: string;
  setBody: (value: string) => void;
  send: (event: React.FormEvent) => void;
  busy: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="max-h-[55vh] min-h-72 space-y-3 overflow-y-auto p-4 sm:p-5">
        {messages.length === 0 && <p className="py-16 text-center text-gray-400">Start with a welcome.</p>}
        {messages.map((message) => {
          const mine = message.sender_id === myId;
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? 'bg-navy text-white' : 'bg-gray-100 text-gray-800'}`}>
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <p className={`mt-1 text-[11px] ${mine ? 'text-white/50' : 'text-gray-400'}`}>
                  {new Date(message.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-black/5 p-3 sm:p-4">
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={4000}
          placeholder="Write a message"
          className="tap min-w-0 flex-1 rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-gold"
        />
        <Button type="submit" variant="gold" disabled={busy || !body.trim()}>Send</Button>
      </form>
    </Card>
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
