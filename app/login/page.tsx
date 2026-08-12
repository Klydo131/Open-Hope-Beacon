'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/lib/demo/store';
import { roleLabel, NAVY } from '@/lib/brand';
import { Avatar, Button, Card } from '@/components/ui';
import type { Role } from '@/lib/types';
import { HopeBeaconMark } from '@/components/HopeBeaconMark';

// Typed against Role on purpose: when a role is added or retired, TypeScript
// points here instead of the app silently calling router.replace(undefined),
// which is what happened to `executive` before this map was tightened.
const HOME: Record<Role, string> = {
  executive: '/admin',
  admin: '/admin',
  dm: '/dm',
  ds: '/ds',
};

function Header({ subtitle }: { subtitle: string }) {
  return (
    <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
      <div className="mx-auto flex max-w-md flex-col items-center">
        <Link href="/" className="text-sm text-white/50 underline">
          ← Home
        </Link>
        <HopeBeaconMark size={56} className="mt-3" />
        <h1 className="mt-3 text-3xl font-extrabold">Sign in to Hope Beacon</h1>
        <p className="mt-1 text-white/70">{subtitle}</p>
      </div>
    </div>
  );
}

// Sign-in. There is no backend here: pick a sample persona and explore any
// role. Nothing leaves the browser.
export default function Login() {
  const { db, signInAs, resetDemo } = useDemo();
  const router = useRouter();

  const personas = db.profiles.filter((p) => p.is_approved);
  const pending = db.profiles.filter((p) => !p.is_approved);

  const go = (id: string, role: Role) => {
    signInAs(id);
    router.replace(HOME[role]);
  };

  return (
    <div className="min-h-screen">
      <Header subtitle="Your account lives on this device." />

      <div className="mx-auto max-w-md space-y-8 px-4 py-8">
        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">Have an invitation?</h2>
          <p className="mt-1 text-gray-500">
            Hope Beacon is a private, invitation-only app. If your church sent you an
            invitation link, open it to complete your sign-up. There is no public
            registration.
          </p>
        </Card>

        <div>
          <p className="mb-3 text-center font-semibold text-gray-500">
            Explore as a sample user
          </p>
          <div className="space-y-3">
            {personas.map((p) => (
              <Card key={p.id}>
                <button
                  onClick={() => go(p.id, p.role)}
                  className="tap flex w-full items-center gap-4 px-4 py-3 text-left"
                >
                  <Avatar name={p.full_name} />
                  <div className="flex-1">
                    <p className="text-lg font-bold text-navy">{p.full_name}</p>
                    {roleLabel(p.role) && (
                      <p className="text-sm text-gray-500">{roleLabel(p.role)}</p>
                    )}
                  </div>
                  <span className="text-2xl text-gray-300" aria-hidden>›</span>
                </button>
              </Card>
            ))}

            {pending.map((p) => (
              <Card key={p.id} className="opacity-70">
                <div className="flex items-center gap-4 px-4 py-3">
                  <Avatar name={p.full_name} />
                  <div className="flex-1">
                    <p className="text-lg font-bold text-navy">{p.full_name}</p>
                    <p className="text-sm text-gray-500">
                      Waiting for admin approval
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-sm font-semibold text-gray-600">
                    Pending
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <button
          onClick={resetDemo}
          className="mx-auto block text-sm text-gray-400 underline"
        >
          Reset demo data
        </button>
      </div>
    </div>
  );
}
