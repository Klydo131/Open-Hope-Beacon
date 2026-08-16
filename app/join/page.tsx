'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useDemo } from '@/lib/demo/store';
import { NAVY } from '@/lib/brand';
import { Button, Card } from '@/components/ui';
import type { Invite, Role } from '@/lib/types';
import { HopeBeaconMark } from '@/components/HopeBeaconMark';
import { IS_LIVE } from '@/lib/mode';
import { LiveJoinPage } from '@/components/LiveCorePages';

// Where each role lands after completing the demo sign-up.
const DEMO_HOME: Record<Role, string> = {
  executive: '/admin',
  admin: '/admin',
  dm: '/dm',
  ds: '/ds',
};

// The invited seeker's sign-up. Reached only via an invite link
// (/join?token=…) created by a church admin — there is no public registration.
// The in-browser store validates and redeems the token; nothing leaves the
// device.
export default function JoinPage() {
  return (
    <Suspense fallback={<Shell><p className="text-white/70">Loading…</p></Shell>}>
      {IS_LIVE ? <LiveJoinPage /> : <Join />}
    </Suspense>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-md flex-col items-center">
          <HopeBeaconMark size={56} />
          <h1 className="mt-3 text-3xl font-extrabold">Welcome to Hope Beacon</h1>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Join() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const router = useRouter();
  const { inviteByToken, acceptInvite, signInAs } = useDemo();

  const invite = inviteByToken(token);
  const status: Invite['status'] | undefined = invite?.status;
  const inviteName = invite?.full_name;
  const inviteRole: Role | undefined = invite?.role;
  const isSeeker = !inviteRole || inviteRole === 'ds';

  const [f, setF] = useState({
    full_name: '',
    preferred_contact: '',
    birthday: '',
    gender: '',
    status: '',
    topics: '',
    city_of_residence: '',
    work_industry: '',
  });
  const [primed, setPrimed] = useState(false);
  const [error, setError] = useState('');

  // Prefill the name from the invite once it's known (works for both paths).
  useEffect(() => {
    if (!primed && inviteName) {
      setPrimed(true);
      setF((p) => ({ ...p, full_name: inviteName }));
    }
  }, [inviteName, primed]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  if (!token || !invite || status === 'revoked') {
    return (
      <Shell>
        <p className="text-white/70">This invitation link isn’t valid.</p>
        <BackHome note="Ask your church for a new invitation." />
      </Shell>
    );
  }
  if (status === 'accepted') {
    return (
      <Shell>
        <p className="text-white/70">This invitation has already been used.</p>
        <BackHome note="If this was you, sign in from the home page." />
      </Shell>
    );
  }

  const submit = () => {
    if (!f.full_name.trim()) return;
    setError('');

    // Staff don't fill the seeker-only fields.
    const fields = {
      full_name: f.full_name,
      preferred_contact: f.preferred_contact || undefined,
      birthday: isSeeker ? f.birthday || undefined : undefined,
      gender: isSeeker ? f.gender || undefined : undefined,
      status: isSeeker ? f.status || undefined : undefined,
      topics_of_interest: isSeeker
        ? f.topics.split(',').map((t) => t.trim()).filter(Boolean)
        : [],
      city_of_residence: isSeeker ? f.city_of_residence || undefined : undefined,
      work_industry: isSeeker ? f.work_industry || undefined : undefined,
    };

    const id = acceptInvite(token, fields);
    if (!id) {
      setError('This invitation could not be completed.');
      return;
    }
    signInAs(id);
    router.replace(DEMO_HOME[inviteRole ?? 'ds'] ?? '/ds');
  };

  return (
    <div className="min-h-screen">
      <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-md flex-col items-center">
          <HopeBeaconMark size={56} />
          <h1 className="mt-3 text-3xl font-extrabold">You’re invited to Hope Beacon</h1>
          <p className="mt-1 text-white/70">
            {isSeeker
              ? 'Your church invited you to begin a journey of faith, walking with a Guide who cares about you.'
              : 'Your church invited you to join the team. Confirm your details to get started.'}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-6 px-4 py-8">
        <Card className="p-5">
          <h2 className="mb-1 text-xl font-bold text-navy">
            {isSeeker ? 'Complete your sign-up' : 'Set up your account'}
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            {isSeeker
              ? 'Just a few details so your church can care for you well.'
              : 'Just confirm your details.'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *" value={f.full_name} onChange={set('full_name')} />
            <Field
              label="Preferred contact"
              value={f.preferred_contact}
              onChange={set('preferred_contact')}
              placeholder="Email, phone, Messenger…"
            />
            {isSeeker && (
              <>
                <Field label="Birthday" type="date" value={f.birthday} onChange={set('birthday')} />
                <Field label="Gender" value={f.gender} onChange={set('gender')} />
                <Field label="Status" value={f.status} onChange={set('status')} />
                <Field
                  label="City of residence"
                  value={f.city_of_residence}
                  onChange={set('city_of_residence')}
                />
                <Field
                  label="Work / Industry"
                  value={f.work_industry}
                  onChange={set('work_industry')}
                />
                <Field
                  label="Topics of interest"
                  value={f.topics}
                  onChange={set('topics')}
                  placeholder="Comma-separated"
                />
              </>
            )}
          </div>
          {error && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200">
              {error}
            </p>
          )}
          <div className="mt-6">
            <Button
              variant="gold"
              disabled={!f.full_name.trim()}
              onClick={submit}
            >
              Join Hope Beacon →
            </Button>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            By joining you’ll see how your information is cared for, and can stop
            or remove it any time.
          </p>
        </Card>
      </div>
    </div>
  );
}

function BackHome({ note }: { note: string }) {
  return (
    <div className="mt-4">
      <p className="text-sm text-white/60">{note}</p>
      <Link href="/" className="mt-2 inline-block text-sm text-white underline">
        ← Go to the home page
      </Link>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
      />
    </label>
  );
}
