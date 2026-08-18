'use client';

// The last two screens that still fell through to the placeholder.
//
// /church and /mail were written against the in-browser store, so on a live
// deployment both showed AppShell's grey "This live screen is being connected"
// card. That card was the single most-reported thing in this app, and every
// report was the same underlying fault: a page with no live version.
//
// /mail needed more than a port. In the tutorial it is a SIMULATED mailbox —
// "what Beacon would send you" — which is a teaching device and means nothing
// on a real deployment, where mail goes to real inboxes. Its honest live
// counterpart is the outbox: who has been invited, who has not arrived, and the
// link to hand over when the email did not make it.

import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { roleNoun } from '@/lib/brand';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { LiveChurchOverview, LiveBoardReport } from '@/components/LiveExecutive';
import { LivePrayerWall } from '@/components/LivePrayer';

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
};

export function LiveChurchPage() {
  const { profile } = useLiveSession();
  const [churchName, setChurchName] = useState<string>();

  useEffect(() => {
    live.myChurch().then((c) => setChurchName(c?.name ?? undefined)).catch(() => {});
  }, []);

  if (!profile) return <p className="text-gray-500">Loading…</p>;
  const leads = profile.role === 'admin' || profile.role === 'executive';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-navy">{churchName ?? 'Our church'}</h1>
        <p className="text-gray-500">Where everyone is, and what the church is praying for.</p>
      </div>
      <LiveChurchOverview />
      <LivePrayerWall />
      {/* The board report is numbers only, and it names nobody — so it is safe
          for every role to see, not just leadership. A Guide who can see what
          their church reports upward is a Guide who trusts the reporting. */}
      {leads && <LiveBoardReport churchName={churchName} />}
    </div>
  );
}

export function LiveMailPage() {
  const { profile } = useLiveSession();
  const [invites, setInvites] = useState<live.OpenInvite[] | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    try { setInvites(await live.listInvites()); setError(''); }
    catch (cause) { setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!profile) return <p className="text-gray-500">Loading…</p>;

  const leads = profile.role === 'admin' || profile.role === 'executive';
  if (!leads) {
    return (
      <Card className="p-6">
        <h1 className="text-2xl font-extrabold text-navy">Mail</h1>
        <p className="mt-2 text-gray-600">
          Hope Beacon sends real email — invitations and password resets go to
          your own inbox, not to a page inside the app. There is nothing for you
          to read here.
        </p>
      </Card>
    );
  }

  const waiting = (invites ?? []).filter((i) => !i.redeemed_at);
  const joined = (invites ?? []).filter((i) => i.redeemed_at);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-navy">Invitations</h1>
        <p className="text-gray-500">
          Everyone this church has invited, and who is still on the doorstep.
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">
          Waiting to accept {invites && <span className="text-gray-400">· {waiting.length}</span>}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          An invitation that failed to send looks exactly like one somebody has
          not opened yet. If a person says they never got theirs, invite them
          again from the Director&rsquo;s screen — that re-sends it.
        </p>

        {!invites ? (
          <p className="mt-4 text-gray-400">Loading…</p>
        ) : waiting.length === 0 ? (
          <p className="mt-4 text-gray-500">Nobody is waiting. Everyone invited has joined.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {waiting.map((i) => {
              const expired = new Date(i.expires_at).getTime() < Date.now();
              return (
                <li key={i.id} className="rounded-xl bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy">{i.full_name || i.email}</p>
                      <p className="truncate text-sm text-gray-600">{i.email}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {roleNoun(i.role)} · invited {ago(i.created_at)}
                        {expired && <span className="ml-1 font-semibold text-red-600">· expired</span>}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        void navigator.clipboard?.writeText(i.email);
                        setCopied(i.id);
                      }}
                    >
                      {copied === i.id ? 'Copied' : 'Copy address'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">
          Accepted {invites && <span className="text-gray-400">· {joined.length}</span>}
        </h2>
        {!invites ? (
          <p className="mt-4 text-gray-400">Loading…</p>
        ) : joined.length === 0 ? (
          <p className="mt-4 text-gray-500">Nobody has accepted an invitation yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {joined.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold text-navy">{i.full_name || i.email}</span>
                  <span className="block truncate text-sm text-gray-600">{i.email}</span>
                </span>
                <span className="text-sm text-green-700">✓ joined {ago(i.redeemed_at!)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
