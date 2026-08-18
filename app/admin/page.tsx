'use client';

import { useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { emitQuest } from '@/lib/quest';
import { LessonSeriesLibrary } from '@/components/LessonSeriesLibrary';
import { useLocale } from '@/lib/i18n';
import { AppShell } from '@/components/AppShell';
import { InviteManager } from '@/components/InviteManager';
import { Mailbox } from '@/components/Mailbox';
import { Avatar, Badge, Button, Card, EmptyState } from '@/components/ui';
import { roleLabel, STAGES, stageInfo, canKick } from '@/lib/brand';
import { momentum, quietCount, trend } from '@/lib/analytics-trend';
import { MomentumLine, TrendChart } from '@/components/TrendChart';
import type { AnalyticsEvent, MaterialType, Role, Track } from '@/lib/types';
import { relTime } from '@/lib/activity';
import { useIsLive } from '@/lib/tutorial';
import { LiveAdminPage } from '@/components/LiveCorePages';

export default function Admin() {
  if (useIsLive()) return <LiveAdminPage />;
  return (
    // Executives too, which they were not.
    //
    // AppShell.NAV sends an executive here, app/login sends an executive here,
    // and this guard then bounced them straight back to the login screen. The
    // role was unusable end to end and nobody had seen it, because there was no
    // executive persona in the seed to sign in as. Adding one for the executive
    // tutorial is what surfaced it: the walk opened /admin and found an empty
    // page with not a single control on it.
    <AppShell allow={['admin', 'executive']}>
      <AdminBody />
    </AppShell>
  );
}

type Tab = 'approvals' | 'pairing' | 'materials' | 'outbox' | 'analytics';

function AdminBody() {
  const { db } = useDemo();
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>('approvals');
  const pending = db.profiles.filter((p) => !p.is_approved).length;
  const recs = db.recommendations.filter((r) => r.status === 'pending').length;
  const unopened = db.emails.filter(
    (e) => !e.opened_at && e.to_user_id === undefined,
  ).length;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'approvals', label: t('approvals'), badge: pending + recs },
    { key: 'pairing', label: t('peoplePairing') },
    { key: 'materials', label: t('materials') },
    { key: 'outbox', label: 'Mail', badge: unopened },
    { key: 'analytics', label: t('analytics') },
  ];

  return (
    <div>
      <h1 className="mb-1 text-3xl font-extrabold text-navy">{t('admin')}</h1>
      <p className="mb-5 text-gray-500">
        Approve members, pair Guides with Explorers, and manage the library.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            data-quest={`tab-${t.key}`}
            onClick={() => {
              setTab(t.key);
              // The tutorial listens rather than the tabs knowing about it.
              emitQuest(`beacon:tab-${t.key}`);
            }}
            className="tap flex min-w-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold sm:px-4 sm:text-base"
            style={
              tab === t.key
                ? { backgroundColor: '#1E2A4A', color: '#fff' }
                : { backgroundColor: '#fff', color: '#1E2A4A' }
            }
          >
            <span className="truncate">{t.label}</span>
            {t.badge ? (
              <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'approvals' && (
        <div className="space-y-6">
          <Recommendations />
          <Approvals />
        </div>
      )}
      {tab === 'pairing' && <Pairing />}
      {tab === 'materials' && <Materials />}
      {tab === 'outbox' && <Mailbox />}
      {tab === 'analytics' && <Analytics />}
    </div>
  );
}

const EVENT_LABEL: Record<AnalyticsEvent['type'], string> = {
  signin: 'Signed in',
  message: 'Sent a message',
  material_share: 'Shared a resource',
  material_open: 'Opened a resource',
  stage_advance: 'Advanced a journey',
  approve: 'Approved a member',
  tutorial_done: 'Finished the tutorial',
  media_upload: 'Added a study note',
  profile_update: 'Updated their profile',
  recommend: 'Recommended a sign-up',
  prayer_request: 'Shared a prayer request',
  lesson_assigned: 'Assigned a lesson',
  lesson_completed: 'Completed a lesson',
  meeting_scheduled: 'Scheduled a meeting',
  invite_sent: 'Invited an Explorer',
  invite_accepted: 'Accepted an invitation',
  member_kicked: 'Removed a member',
  member_disapproved: 'Disapproved a sign-up',
  // The counts are visible to an admin; the note and reminder text never is.
  note_added: 'Wrote a private note',
  blog_written: 'Wrote a blog post',
  followup_added: 'Set a follow-up',
  followup_done: 'Completed a follow-up',
};

// Two scopes, deliberately separated:
//   • LOCAL — detailed, per-person behaviour that stays on this device. This is
//     the church's own data to analyze; it names people.
//   • GLOBAL — an anonymous rollup (totals + trends, no identities) that is safe
//     to sync to a shared backend for wider analysis.
function Analytics() {
  const { db } = useDemo();
  const { t } = useLocale();
  const [scope, setScope] = useState<'local' | 'global'>('local');

  const events = [...db.analytics].sort((a, b) => b.at.localeCompare(a.at));
  const nameOf = (id: string) =>
    db.profiles.find((p) => p.id === id)?.full_name ?? 'Unknown';

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <button
          onClick={() => setScope('local')}
          className="tap flex-1 rounded-xl px-4 text-base font-semibold"
          style={
            scope === 'local'
              ? { backgroundColor: '#1E2A4A', color: '#fff' }
              : { backgroundColor: '#fff', color: '#1E2A4A' }
          }
        >
          🔒 {t('localScope')}
        </button>
        <button
          onClick={() => setScope('global')}
          className="tap flex-1 rounded-xl px-4 text-base font-semibold"
          style={
            scope === 'global'
              ? { backgroundColor: '#1E2A4A', color: '#fff' }
              : { backgroundColor: '#fff', color: '#1E2A4A' }
          }
        >
          🌐 {t('globalScope')}
        </button>
      </div>

      {scope === 'local' ? (
        <LocalAnalytics events={events} nameOf={nameOf} />
      ) : (
        <GlobalAnalytics events={events} />
      )}
    </div>
  );
}

function LocalAnalytics({
  events,
  nameOf,
}: {
  events: AnalyticsEvent[];
  nameOf: (id: string) => string;
}) {
  const { db } = useDemo();
  const { t } = useLocale();
  // Per-person activity counts (detailed — names shown, stays on device).
  const byUser = new Map<string, number>();
  for (const e of events) byUser.set(e.user_id, (byUser.get(e.user_id) ?? 0) + 1);
  const ranked = [...byUser.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
        🔒 <strong>Local data.</strong> Detailed, names shown. This stays on this
        device and is the church’s own to analyze.
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-lg font-bold text-navy">{t('mostActive')}</h3>
        <div className="space-y-2">
          {ranked.slice(0, 6).map(([id, n]) => (
            <div key={id} className="flex items-center gap-3">
              <span className="w-40 truncate font-semibold text-navy">
                {nameOf(id)}
              </span>
              <div className="h-6 flex-1 rounded-full bg-gray-100">
                <div
                  className="h-6 rounded-full"
                  style={{
                    width: `${(n / (ranked[0]?.[1] || 1)) * 100}%`,
                    backgroundColor: '#2F80ED',
                  }}
                />
              </div>
              <span className="w-6 text-right font-bold text-navy">{n}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-lg font-bold text-navy">{t('recentActivity')}</h3>
        <ul className="space-y-2">
          {events.slice(0, 12).map((e) => (
            <li key={e.id} className="flex items-center gap-3 text-sm">
              <span className="w-40 truncate font-semibold text-navy">
                {nameOf(e.user_id)}
              </span>
              <span className="flex-1 text-gray-600">{EVENT_LABEL[e.type]}</span>
              <span className="text-gray-400">
                {new Date(e.at).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 text-lg font-bold text-navy">Explorer study uploads</h3>
        <p className="mb-3 text-sm text-gray-500">
          What Explorers are adding to their own shelves — advanced monitoring.
        </p>
        {db.seeker_media.length === 0 ? (
          <p className="text-gray-400">No explorer uploads yet.</p>
        ) : (
          <ul className="space-y-2">
            {[...db.seeker_media]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 10)
              .map((m) => (
                <li key={m.id} className="flex items-center gap-3 text-sm">
                  <span className="w-40 truncate font-semibold text-navy">
                    {nameOf(m.ds_id)}
                  </span>
                  <span className="flex-1 truncate text-gray-600">{m.title}</span>
                  <span className="text-gray-400">
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function GlobalAnalytics({ events }: { events: AnalyticsEvent[] }) {
  const { db } = useDemo();
  const { t } = useLocale();

  // Anonymous rollups only — counts and trends, never a name.
  const byType = new Map<AnalyticsEvent['type'], number>();
  for (const e of events) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  const typeRows = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const maxType = Math.max(1, ...typeRows.map((r) => r[1]));

  const activeUsers = new Set(events.map((e) => e.user_id)).size;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const last7 = events.filter((e) => new Date(e.at).getTime() >= weekAgo).length;

  // Over time, which is what this screen claimed to show and did not.
  //
  // Every figure above is a total since the beginning, and a total that can only
  // go up cannot answer the question a church council actually asks. Nobody has
  // ever wanted to know how many messages have ever been sent; they want to know
  // whether there is more happening than there was.
  const weekly = trend(events, { grain: 'week', count: 8 });
  const pace = momentum(weekly);
  // Stage advances are the one number that is about people rather than usage:
  // somebody moved forward in their journey this week.
  const advances = trend(events, { grain: 'week', count: 8, types: ['stage_advance'] });
  const advancePace = momentum(advances);
  const quiet = quietCount(weekly);


  const active = db.pairings.filter((p) => p.status === 'active');
  const stageCounts = STAGES.map((s) => ({
    ...s,
    n: active.filter((p) => p.journey_stage === s.key).length,
  }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-800 ring-1 ring-sky-200">
        🌐 <strong>Global data.</strong> Anonymous totals and trends — no names,
        no profiles. Safe to sync to a shared backend for wider analysis.
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total events" value={events.length} />
        <Stat label="Active people" value={activeUsers} />
        <Stat label="Last 7 days" value={last7} />
      </div>

      <Card className="p-5">
        <h3 className="text-lg font-bold text-navy">Activity over time</h3>
        <p className="mb-3 text-sm text-gray-500">
          Eight weeks. The last bar is this week, still going.
        </p>
        <TrendChart points={weekly} color="#2F80ED" unit="Actions" />
        <div className="mt-3 space-y-1">
          <MomentumLine {...pace} noun="actions" />
          {quiet > 0 && (
            <p className="text-sm text-gray-500">
              {quiet === 1 ? 'One week' : `${quiet} weeks`} in this stretch had no
              activity at all.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-lg font-bold text-navy">People moving forward</h3>
        <p className="mb-3 text-sm text-gray-500">
          How often somebody was moved on a stage in their journey. The one number
          here that is about people rather than usage.
        </p>
        <TrendChart points={advances} color="#7FB03A" unit="Steps forward" />
        <div className="mt-3">
          <MomentumLine {...advancePace} noun="people moved forward" />
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-lg font-bold text-navy">{t('actionsByType')}</h3>
        <div className="space-y-2">
          {typeRows.map(([type, n]) => (
            <div key={type} className="flex items-center gap-3">
              <span className="w-40 text-sm font-semibold text-navy">
                {EVENT_LABEL[type]}
              </span>
              <div className="h-6 flex-1 rounded-full bg-gray-100">
                <div
                  className="h-6 rounded-full"
                  style={{ width: `${(n / maxType) * 100}%`, backgroundColor: '#7FB03A' }}
                />
              </div>
              <span className="w-6 text-right font-bold text-navy">{n}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-lg font-bold text-navy">{t('seekersByStage')}</h3>
        <div className="flex items-end gap-2" style={{ height: 120 }}>
          {stageCounts.map((s) => (
            <div key={s.key} className="flex flex-1 flex-col items-center justify-end">
              <span className="text-sm font-bold text-navy">{s.n}</span>
              <div
                className="w-full rounded-t"
                style={{
                  height: `${(s.n / Math.max(1, ...stageCounts.map((x) => x.n))) * 90}px`,
                  backgroundColor: s.color,
                  minHeight: 4,
                }}
              />
              <span className="mt-1 text-center text-xs text-gray-500">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <BoardView
        missionaries={db.profiles.filter((p) => p.role === 'dm' && p.is_approved).length}
        walkedWith={active.length}
        actionsThisWeek={pace.latest}
        movedForwardThisWeek={advancePace.latest}
      />
    </div>
  );
}

// What the church board is shown, inside the account of somebody who has one.
//
// The board used to be a separate guided walk on the sign-in screen, and the
// owner was right to cut it: "take out the church member account since they
// don't have any account in this app." Offering board members a card to tap
// implied an account that does not exist and is not being built — the board's
// approval of a missionary happens in the board's own meeting, off the app,
// which is the client's decision and still stands.
//
// But the need behind it is real. Somebody has to be able to answer "what does
// the church actually see about us" in a board meeting, and the person who will
// be asked is the admin or the executive — people who DO have accounts. So the
// board's view lives here, in their account, as something to read out or print,
// rather than as a role nobody can sign in as.
//
// It is deliberately the anonymous rollup and nothing else. Everything on this
// card is a count.
function BoardView({
  missionaries,
  walkedWith,
  actionsThisWeek,
  movedForwardThisWeek,
}: {
  missionaries: number;
  walkedWith: number;
  actionsThisWeek: number;
  movedForwardThisWeek: number;
}) {
  return (
    <Card className="p-5" data-panel="board">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-navy">For the church board</h3>
          <p className="text-sm text-gray-500">
            The four numbers to read out. Nothing here names anybody.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="no-print tap-sm shrink-0 rounded-xl bg-gray-100 px-4 text-sm font-bold text-navy transition hover:bg-gray-200"
        >
          🖨️ Print
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        {[
          ['Missionaries', missionaries],
          ['People being walked with', walkedWith],
          ['Actions this week', actionsThisWeek],
          ['Moved forward this week', movedForwardThisWeek],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-gray-50 p-3">
            <dd className="text-2xl font-extrabold text-navy">{value}</dd>
            <dt className="mt-0.5 text-xs text-gray-500">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-2 text-sm text-gray-600">
        <p>
          <strong className="text-navy">What the board is not shown.</strong> No
          names against these numbers, no messages, no prayer requests. If you
          want to know how one particular person is doing, ask the Guide
          walking with them. The app will not tell you, and that is on purpose.
        </p>
        <p>
          <strong className="text-navy">Where the board&rsquo;s approval
          happens.</strong> In the board meeting, as it does today. The board has
          no account here and does not need one. Once the board decides, an admin
          records it by approving that person on the Approvals tab, and the app
          remembers who did it and when.
        </p>
      </div>
    </Card>
  );
}


function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4 text-center">
      <p className="text-3xl font-extrabold text-navy">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </Card>
  );
}

// Names a missionary has put forward. The person has no account yet, so there
// is nothing to approve — there is somebody to invite. Inviting from here
// carries the recommending missionary onto the invite, which is what makes the
// pairing exist the moment they finish signing up.
function Recommendations() {
  const { db, inviteRecommended, declineRecommendation } = useDemo();
  const pending = db.recommendations.filter((r) => r.status === 'pending');
  const decided = db.recommendations.filter((r) => r.status !== 'pending');
  const nameOf = (id: string) =>
    db.profiles.find((p) => p.id === id)?.full_name ?? 'A Guide';

  if (pending.length === 0 && decided.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">
        🙋 Recommended by your Guides
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        These people do not have accounts yet. Invite one and they join already
        paired with the Guide who put them forward.
      </p>

      {pending.length === 0 ? (
        <p className="text-gray-500">Nothing waiting on you here.</p>
      ) : (
        <div className="space-y-2">
          {pending.map((r) => (
            <div key={r.id} className="rounded-xl bg-gray-50 p-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="font-bold text-navy">{r.full_name}</p>
                <p className="text-sm text-gray-500">{r.email}</p>
              </div>
              <p className="text-sm text-gray-500">
                Recommended by {nameOf(r.dm_id)} · {relTime(r.created_at)}
              </p>
              {r.note && (
                <p className="mt-1 text-sm italic text-gray-600">“{r.note}”</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="gold"
                  data-quest="invite-recommended"
                  onClick={() => {
                    inviteRecommended(r.id);
                    emitQuest('beacon:invite-recommended');
                  }}
                >
                  ✉️ Invite {r.full_name.split(' ')[0]}
                </Button>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Not invite ${r.full_name}? ${nameOf(r.dm_id)} will be told.`,
                      )
                    )
                      declineRecommendation(r.id);
                  }}
                  className="tap rounded-xl bg-red-50 px-4 text-sm font-semibold text-red-600 hover:bg-red-100"
                >
                  Not now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <div className="mt-4 space-y-1">
          {decided.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm"
            >
              <span className="font-semibold text-navy">{r.full_name}</span>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${
                  r.status === 'invited'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {r.status === 'invited' ? 'Invited' : 'Not this time'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Approvals() {
  const { db, approveUser, disapproveMember } = useDemo();
  const { t } = useLocale();
  const [roleChoice, setRoleChoice] = useState<Record<string, Role>>({});
  const pending = db.profiles.filter((p) => !p.is_approved);

  if (pending.length === 0)
    return <EmptyState title={t('allCaughtUp')} hint="No accounts awaiting approval." />;

  return (
    <div className="space-y-3">
      {pending.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex items-center gap-3">
            <Avatar name={p.full_name} avatar={p.avatar} photo={p.photo} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-navy">{p.full_name}</p>
              <p className="text-sm text-gray-500">
                {p.city_of_residence} · signed up{' '}
                {new Date(p.created_at).toLocaleDateString()}
              </p>
              {/* A missionary can vouch for a sign-up from their mailbox. That
                  is a note to help you decide, not a gate: approval is yours
                  alone. The Church Board's approval of missionaries happens
                  off the app entirely. */}
              {p.recommended_by && (
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-sm font-semibold text-green-700">
                  🙋 Recommended by{' '}
                  {db.profiles.find((x) => x.id === p.recommended_by)?.full_name ??
                    'a Guide'}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <select
              value={roleChoice[p.id] ?? 'ds'}
              onChange={(e) =>
                setRoleChoice((r) => ({
                  ...r,
                  [p.id]: e.target.value as Role,
                }))
              }
              className="tap w-full min-w-0 rounded-xl bg-gray-100 px-3 text-base"
              aria-label={`Role for ${p.full_name}`}
            >
              <option value="ds">Someone exploring</option>
              <option value="dm">Guide</option>
              <option value="admin">Admin</option>
            </select>
            <Button
              variant="gold"
              data-quest="approve"
              onClick={() => {
                approveUser(p.id, roleChoice[p.id] ?? 'ds');
                emitQuest('beacon:approve');
              }}
            >
              {t('approve')}
            </Button>
            <button
              onClick={() => {
                if (confirm(`Disapprove ${p.full_name}? Their sign-up will be removed.`))
                  disapproveMember(p.id);
              }}
              className="tap rounded-xl bg-red-50 px-4 text-sm font-semibold text-red-600 hover:bg-red-100"
            >
              Disapprove
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Pairing() {
  const { db, createPairing, kickMember, currentUser } = useDemo();
  const { t } = useLocale();
  const [dm, setDm] = useState('');
  const [ds, setDs] = useState('');
  const [track, setTrack] = useState<Track>('digital');

  const dms = db.profiles.filter((p) => p.role === 'dm' && p.is_approved);
  const pairedDsIds = new Set(
    db.pairings.filter((p) => p.status === 'active').map((p) => p.ds_id),
  );
  const unpairedDs = db.profiles.filter(
    (p) => p.role === 'ds' && p.is_approved && !pairedDsIds.has(p.id),
  );
  const active = db.pairings.filter((p) => p.status === 'active');

  return (
    <div className="space-y-6">
      <InviteManager />

      <Card className="p-5">
        <h2 className="mb-4 text-xl font-bold text-navy">{t('createPairing')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-gray-500">{t('missionary')}</span>
            <select
              value={dm}
              onChange={(e) => setDm(e.target.value)}
              className="tap mt-1 w-full rounded-xl bg-gray-100 px-3 text-base"
            >
              <option value="">Choose a Guide…</option>
              {dms.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-gray-500">{t('seeker')}</span>
            <select
              value={ds}
              onChange={(e) => setDs(e.target.value)}
              className="tap mt-1 w-full rounded-xl bg-gray-100 px-3 text-base"
            >
              <option value="">Choose an Explorer…</option>
              {unpairedDs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-gray-500">{t('track')}</span>
            <select
              value={track}
              onChange={(e) => setTrack(e.target.value as Track)}
              className="tap mt-1 w-full rounded-xl bg-gray-100 px-3 text-base"
            >
              <option value="digital">Digital / online</option>
              <option value="traditional">Traditional / in-person</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button
              disabled={!dm || !ds}
              data-quest="create-pairing"
              onClick={() => {
                createPairing(dm, ds, track);
                setDm('');
                setDs('');
                emitQuest('beacon:pair');
              }}
              className="w-full"
            >
              {t('pairThem')}
            </Button>
          </div>
        </div>
        {unpairedDs.length === 0 && (
          <p className="mt-3 text-sm text-gray-400">
            Every approved Explorer is already paired.
          </p>
        )}
      </Card>

      <div>
        <h2 className="mb-3 text-xl font-bold text-navy">{t('activePairings')}</h2>
        <div className="space-y-2">
          {active.map((p) => {
            const dmP = db.profiles.find((x) => x.id === p.dm_id)!;
            const dsP = db.profiles.find((x) => x.id === p.ds_id)!;
            const info = stageInfo(p.journey_stage);
            return (
              <Card key={p.id} className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="font-bold text-navy">{dsP.full_name}</p>
                  <p className="text-sm text-gray-500">
                    with {dmP.full_name}
                  </p>
                </div>
                <Badge color={info.color}>{info.label}</Badge>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-xl font-bold text-navy">Members</h2>
        <div className="space-y-2">
          {db.profiles
            .filter((p) => p.is_approved)
            .map((m) => {
              const removable =
                currentUser && m.id !== currentUser.id && canKick(currentUser.role, m.role);
              return (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 px-4 py-3"
                >
                  <Avatar name={m.full_name} avatar={m.avatar} photo={m.photo} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy">{m.full_name}</p>
                    {roleLabel(m.role, currentUser?.role ?? '') && (
                      <p className="text-sm text-gray-500">{roleLabel(m.role, currentUser?.role ?? '')}</p>
                    )}
                  </div>
                  {removable && (
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Remove ${m.full_name} from the church? Their pairings will be archived.`,
                          )
                        )
                          kickMember(m.id);
                      }}
                      className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </Card>
    </div>
  );
}

function Materials() {
  const { db, addMaterial } = useDemo();
  const { t } = useLocale();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MaterialType>('link');
  const [url, setUrl] = useState('');

  return (
    <div className="space-y-6">
      {/* Series first. A single reading is something a missionary shares in
          passing; a series is a course the church has decided to teach, and it
          is the thing an admin comes to this screen to build. */}
      <LessonSeriesLibrary />

      <Card className="p-5">
        <h2 className="mb-4 text-xl font-bold text-navy">{t('addMaterial')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('title')}
            className="tap w-full min-w-0 rounded-xl bg-gray-100 px-3 text-base"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as MaterialType)}
            className="tap w-full min-w-0 rounded-xl bg-gray-100 px-3 text-base"
          >
            <option value="link">Link</option>
            <option value="pdf">PDF</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="image">Image</option>
          </select>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Link (optional)"
            className="tap w-full min-w-0 rounded-xl bg-gray-100 px-3 text-base sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <Button
              variant="gold"
              disabled={!title.trim()}
              onClick={() => {
                addMaterial({ title, type, external_url: url || undefined });
                setTitle('');
                setUrl('');
              }}
            >
              {t('addToLibrary')}
            </Button>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-xl font-bold text-navy">{t('library')}</h2>
        <div className="space-y-2">
          {db.materials.map((m) => (
            <Card key={m.id} className="flex items-center gap-3 p-4">
              <span className="text-2xl" aria-hidden>
                {MATERIAL_ICON[m.type]}
              </span>
              <div className="flex-1">
                <p className="font-semibold text-navy">{m.title}</p>
                <p className="text-sm text-gray-500">{m.description}</p>
              </div>
              <span className="text-sm uppercase text-gray-400">{m.type}</span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

const MATERIAL_ICON: Record<string, string> = {
  pdf: '📄',
  video: '🎬',
  audio: '🎧',
  image: '🖼️',
  link: '🔗',
};
