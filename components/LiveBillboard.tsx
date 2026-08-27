'use client';

// The church home board, live.
//
// The tutorial has had a masthead, a strip of things for a Director to action,
// a row of notices and a stream of what is happening. Live had a heading and
// two stat cards. This is the same board against the real database.
//
// TWO THINGS ARE DELIBERATELY DIFFERENT FROM THE TUTORIAL.
//
// The notices are real rows a Director writes, not three hard-coded strings.
// A demonstration can pretend; a church needs to change the time of a meeting.
//
// There is no feed of journey milestones. In the tutorial that stream is
// anonymised invented data. Against a real congregation of forty, "a friend
// moved forward this week" is a sentence a handful of people can attach a name
// to, and the people it is about never agreed to be in it. The counts say the
// same thing without pointing at anybody.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import * as live from '@/lib/live/data';
import type { Profile } from '@/lib/types';
import { useLiveSession } from '@/lib/live/session';
import { Button, Card } from '@/components/ui';
import { NAVY, GOLD } from '@/lib/brand';

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'That did not work.';
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white/90">
      {label}
    </span>
  );
}

export function LiveBillboard({ churchName, between }: {
  churchName?: string | null;
  /**
   * Rendered between the masthead and the notices.
   *
   * The church home reads masthead, then Community Blogs, then Announcements,
   * and the blogs are not this component's business. Passing them in beats
   * either importing them here or splitting the billboard into two exports
   * that a caller has to remember to use in the right order.
   */
  between?: React.ReactNode;
}) {
  const { profile } = useLiveSession();
  const leads = profile?.role === 'admin' || profile?.role === 'executive';
  // WHO MAY PIN A NOTICE. Guides as well as leadership, because a Guide
  // arranging something for the people they walk with had nowhere to pin it and
  // was sending the same message five times. Not Explorers: a notice sits above
  // everybody's church screen, and that is an act of leading rather than of
  // speaking. An Explorer with something to say has Community Blogs.
  const mayPost = leads || profile?.role === 'dm';

  const [members, setMembers] = useState<Profile[] | null>(null);
  const [notices, setNotices] = useState<live.Announcement[] | null>(null);
  const [error, setError] = useState('');

  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // A member who is not leadership cannot read the roster, and that is
      // correct. The board still has to draw for them, so the counts are
      // simply absent rather than the page failing.
      const [people, board] = await Promise.all([
        live.listMembers().catch(() => null),
        live.listAnnouncements(),
      ]);
      setMembers(people);
      setNotices(board);
      setError('');
    } catch (cause) { setNotices([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  const guides = members?.filter((m) => m.role === 'dm' && m.is_approved).length;
  const explorers = members?.filter((m) => m.role === 'ds' && m.is_approved).length;
  const waiting = members?.filter((m) => !m.is_approved) ?? [];
  // A taken-down notice stays visible to whoever can put it back up, which is
  // leadership and its own author.
  const shown = (notices ?? []).filter(
    (n) => n.is_pinned || leads || n.author_id === profile?.id,
  );

  return (
    <div className="space-y-6">
      {/* Masthead */}
      <div
        className="overflow-hidden rounded-2xl p-6 text-white sm:p-8"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2b3d6b 100%)` }}
      >
        <p className="text-sm font-semibold uppercase tracking-wider text-white/50">Church home</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{churchName || 'Our church'}</h1>
        <p className="mt-2 max-w-xl text-white/70">
          Everything the whole church shares, in one place. Nobody&rsquo;s private
          journey is ever shown here.
        </p>
        {(guides !== undefined || explorers !== undefined) && (
          <div className="mt-5 flex flex-wrap gap-2">
            {explorers !== undefined && (
              <Chip label={`${explorers} Explorer${explorers === 1 ? '' : 's'} walking`} />
            )}
            {guides !== undefined && (
              <Chip label={`${guides} Guide${guides === 1 ? '' : 's'}`} />
            )}
          </div>
        )}
      </div>

      {error && <Card className="p-4 text-sm text-red-800">{error}</Card>}

      {/* For a Director to action. Drawn only when there is something to do:
          a permanent "nothing waiting" panel is furniture. */}
      {leads && waiting.length > 0 && (
        <div className="rounded-2xl border-2 bg-white p-5 shadow-sm" style={{ borderColor: `${GOLD}66` }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-navy">🛠️ For you to action</h2>
            <Link href="/admin" className="text-sm font-semibold text-navy underline">
              Approvals →
            </Link>
          </div>
          <p className="text-sm text-gray-600">
            {waiting.length} {waiting.length === 1 ? 'person needs' : 'people need'} a decision.
          </p>
          <div className="mt-2 space-y-1">
            {waiting.slice(0, 4).map((p) => (
              <p key={p.id} className="truncate text-sm font-semibold text-navy">
                {p.full_name || 'Invited member'}
              </p>
            ))}
          </div>
        </div>
      )}

      {between}

      {/* Notices */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-room">📌 Announcements</h2>
          {/* WRITING MOVED TO /publish. This screen is what the church has
              said; a composer on top of it made a reader's page into a
              writer's page for the three roles who can write. The take-down
              controls stayed, beside the notice they act on: deleting is about
              the thing in front of you, writing is a task you go and do. */}
          {mayPost && (
            <Link href="/publish" className="text-sm font-semibold text-room underline underline-offset-2">
              Write one →
            </Link>
          )}
        </div>

        {shown.length === 0 ? (
          <Card className="p-6 text-center text-gray-400">
            {mayPost
              ? 'No notices yet. Write the first one in Publish.'
              : 'Nothing pinned at the moment.'}
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {shown.map((n) => (
              <Card key={n.id} className={`p-4 ${n.is_pinned ? '' : 'opacity-60'}`}>
                <span className="text-2xl" aria-hidden>{n.icon}</span>
                <p className="mt-1 font-bold text-navy">{n.title}</p>
                {n.body && <p className="text-sm text-gray-600">{n.body}</p>}
                {n.when_text && (
                  <p className="mt-2 text-xs font-semibold text-gray-400">{n.when_text}</p>
                )}
                {(leads || n.author_id === profile?.id) && (
                  <div className="mt-2 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(() => live.pinAnnouncement(n.id, !n.is_pinned))}
                      className="text-xs font-semibold text-navy underline"
                    >
                      {n.is_pinned ? 'Take down' : 'Put back up'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(() => live.deleteAnnouncement(n.id))}
                      className="text-xs text-gray-400 underline"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
