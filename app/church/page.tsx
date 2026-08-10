'use client';

import { useDemo } from '@/lib/demo/store';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui';
import { ChurchBillboard } from '@/components/ChurchBillboard';
import { FeedbackButton } from '@/components/Feedback';
import { STAGES, ROLE_LABELS } from '@/lib/brand';
import type { Role } from '@/lib/types';

// The church home — the shared board every account lands on. The activity
// billboard leads (components/ChurchBillboard), and the prayer wall and the
// aggregate "our journey together" stats sit below it. No individual's private
// journey ever appears here; leaders get their monitoring detail in their own
// dashboards.
const ALL: Role[] = ['executive', 'admin', 'dm', 'ds'];

export default function ChurchPage() {
  return (
    <AppShell allow={ALL}>
      <Body />
    </AppShell>
  );
}

function Body() {
  const { db, currentUser } = useDemo();
  const me = currentUser!;
  const active = db.pairings.filter((p) => p.status === 'active');
  const counts = STAGES.map((s) => ({
    ...s,
    n: active.filter((p) => p.journey_stage === s.key).length,
  }));
  const max = Math.max(1, ...counts.map((c) => c.n));

  const members = db.profiles.filter((p) => p.is_approved);
  const dms = members.filter((p) => p.role === 'dm').length;
  const seekers = members.filter((p) => p.role === 'ds').length;

  const seesMore = me.role === 'admin' || me.role === 'executive';

  return (
    <div className="space-y-6">
      {/* The activity billboard — masthead, privileged strip, announcements and
          the live stream of what's happening across the church. */}
      <ChurchBillboard />

      {/* Home is where people land, so the way to report something lives here
          too rather than only behind a Settings menu. */}
      <div className="mt-6 rounded-2xl bg-white p-5 text-center ring-1 ring-black/5">
        <p className="font-bold text-navy">How is Beacon working for you?</p>
        <p className="mb-3 mt-1 text-sm text-gray-500">
          Anything confusing, broken, or missing. One sentence is plenty.
        </p>
        <FeedbackButton className="tap" />
      </div>

      {/* Prayer wall — anonymously shared requests, visible to everyone */}
      {(() => {
        const wall = db.prayer_requests
          .filter((r) => r.share_with_board)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        return (
          <div>
            <h2 className="mb-1 text-xl font-bold text-navy">🙏 Prayer wall</h2>
            <p className="mb-3 text-sm text-gray-500">
              Requests our church family is praying over — shared anonymously, no
              names.
            </p>
            {wall.length === 0 ? (
              <Card className="p-4">
                <p className="text-gray-400">No requests right now.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {wall.map((r) => (
                  <Card key={r.id} className="p-4">
                    <p className="text-navy">“{r.body}”</p>
                    <p
                      className="mt-1 text-sm font-semibold"
                      style={{
                        color:
                          r.status === 'answered'
                            ? '#7FB03A'
                            : r.status === 'praying'
                              ? '#2F80ED'
                              : '#5B6675',
                      }}
                    >
                      {r.status === 'answered'
                        ? 'Answered 🙌 — praise God'
                        : r.status === 'praying'
                          ? 'The church is praying'
                          : 'Please pray'}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Church at a glance.
          The headline counts are for everyone — how many are walking, how many
          are walking with them. The six-stage breakdown below is not: /church
          is open to every role, so a seeker standing here could read the ladder
          off the chart and work out where the church places people. That is
          exactly what the client asked to hide from them, so the bars are
          gated and the counts are not. */}
      <Card className="p-5">
        <h2 className="mb-4 text-xl font-bold text-navy">Our journey together</h2>
        <div className="mb-5 grid grid-cols-3 gap-3 text-center">
          <Stat n={seekers} label="Seekers walking" />
          <Stat n={dms} label="Missionaries" />
          <Stat n={members.length} label="Members" />
        </div>
        {seesMore && (
        <div className="space-y-2">
          {counts.map((c) => (
            <div key={c.key} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-right text-sm font-semibold text-navy">
                {c.label}
              </span>
              <div className="h-6 flex-1 rounded-full bg-gray-100">
                <div
                  className="flex h-6 items-center justify-end rounded-full px-2 text-sm font-bold text-white"
                  style={{ width: `${Math.max(8, (c.n / max) * 100)}%`, backgroundColor: c.color }}
                >
                  {c.n}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
        <p className="mt-3 text-sm text-gray-400">
          Counts only — no names or personal details appear on the general board.
        </p>
      </Card>

      {seesMore && (
        <Card className="p-4">
          <p className="text-sm text-gray-600">
            👋 As {ROLE_LABELS[me.role]}, you also have a private{' '}
            <strong>{me.role === 'admin' ? 'Admin' : 'Dashboard'}</strong> with the
            monitoring detail your role allows.
          </p>
        </Card>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <Card className="p-3">
      <p className="text-3xl font-extrabold text-navy">{n}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </Card>
  );
}
