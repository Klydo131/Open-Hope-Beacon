'use client';

import Link from 'next/link';
import { MinorBadge } from '@/components/MinorBadge';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { stageInfo, previousStage, STAGES, nextStage } from '@/lib/brand';
import { useLiveSession } from '@/lib/live/session';
import * as live from '@/lib/live/data';
import { LiveReportControl } from '@/components/LiveSafeguarding';
import type { Message, Stage } from '@/lib/types';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveBlogFeed } from '@/components/LiveBlog';
import { LivePrayerForGuide } from '@/components/LivePrayer';
import { LiveMeetings } from '@/components/LiveMeetings';
import { useDraft, clearDraft } from '@/lib/drafts';
import { LiveLibraryForGuide } from '@/components/LiveLibrary';
import { LiveFollowUps, LiveNotes } from '@/components/LiveMinistry';
import { LiveStudies } from '@/components/LiveStudies';
import { NewBadge } from '@/components/NewBadge';
import { Avatar, Button, Card, Tabs } from '@/components/ui';
import { JourneyPath } from '@/components/JourneyPath';
import { Conversation, Notice, errorText } from '@/components/live/shared';

// SPLIT OUT OF components/LiveCorePages.tsx, which had grown to three thousand
// lines holding nineteen components: the signed-out door, the Director's whole
// admin screen, both Guide screens, the Explorer's screen and every small piece
// they share. Nobody can hold that in their head, and a maintainer looking for
// the login form had to know it was in a file called "core pages".
//
// The old module still exists as a re-export, so nothing that imported from it
// had to change. New code should import from the file that actually holds the
// screen.

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}


export function LiveGuidePage() {
  const { profile } = useLiveSession();
  const [rows, setRows] = useState<live.PairingView[]>([]);
  const [error, setError] = useState('');
  // LOADED, FAILED AND GENUINELY EMPTY ARE THREE DIFFERENT THINGS.
  //
  // `rows.length === 0` was all three at once, so a Guide with two Explorers
  // whose pairings failed to load was told "Nobody is paired with you yet.
  // Your Director arranges that." That sentence is not a blank screen; it is
  // a claim about the church, and it was false, and it sent somebody to ask a
  // Director for something they already had.
  const [ready, setReady] = useState(false);
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
    live.listPairings()
      .then((data) => {
        if (!alive) return;
        setRows(data.filter((row) => row.status === 'active'));
        setReady(true);
      })
      .catch((cause) => { if (alive) setError(errorText(cause)); });
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
      {/* GREETED BY NAME, AND TOLD THE ONE NUMBER THAT MATTERS.
          The heading was "My Explorers" over "Only people paired with you
          appear here", which is a label and a disclaimer: it says what the page
          is called and what it is not. The tutorial has opened on a greeting
          and a count since it was written, and a Guide trained there signed in
          to something colder and less informative. The count is the number the
          whole design turns on. */}
      <h1 className="text-3xl font-extrabold text-room">
        {greeting()}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
      </h1>
      <p className="mt-1 text-room-soft">
        {rows.length > 0
          ? `You are walking with ${rows.length} ${rows.length === 1 ? 'person' : 'people'}.`
          : error
            // Say nothing about the pairings, because nothing is known about
            // them. The Notice underneath carries what actually happened.
            ? 'Your Explorers could not be loaded just now.'
            : ready
              ? 'Nobody is paired with you yet. Your Director arranges that.'
              : 'Loading the people you walk with.'}
      </p>
      {error && <div className="mt-5"><Notice tone="error">{error}</Notice></div>}

      {/* HOW MANY, AT WHAT LEVEL, AND HOW MANY HAVE FINISHED.
          A Guide could see a list of cards and nothing else: answering "where
          are my people up to" meant reading every card and counting. These are
          the same rows, added up. */}
      {rows.length > 0 && <MyExplorersAtAGlance rows={rows} waiting={unprayed} />}

      {/* Cases moved to their own room, /cases, reachable from the rail on
          every screen. A formal hearing does not belong as one card among a
          Guide's Explorers. */}
      {/* ONE ROW PER PERSON, FULL WIDTH, NOT A GRID OF TILES.
          Two columns of tiles made every name compete with the one beside it,
          and on a desktop it left the right half of a wide screen empty while
          truncating the names in the left half. A roster is a list: face, name,
          what is going on with them, and where they are up to, in the same
          places on every row so the eye can run straight down the column.

          The stage sits on the right on its own line above the path, which is
          where the reference design puts it and where a scan for "who is at
          Commission" actually looks. */}
      <div className="mt-6 space-y-2.5">
        {rows.map((row) => {
          const stage = stageInfo(row.journey_stage);
          const waiting = unprayed[row.ds_id] ?? 0;
          return (
            <Link key={row.id} href={`/dm/${row.id}`} className="block">
              <Card className="p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4">
                  <Avatar name={row.ds_name} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-lg font-bold text-navy">{row.ds_name}</p>
                      <NewBadge person={{ signup_completed_at: row.ds_signup_completed_at }} />
                      {/* The Guide is the adult in the room, so they see this
                          and not only a Director. Drawn next to the name rather
                          than tucked into the profile, because a safeguarding
                          mark you have to go looking for is one nobody sees. */}
                      <MinorBadge person={{ birthday: row.ds_birthday, guardian_consent_at: row.ds_guardian_consent_at }} />
                    </div>
                    {/* THE LINE UNDER THE NAME IS WHAT NEEDS DOING, when there
                        is anything. A prayer request waiting is the one thing
                        on this row that is asking something of the Guide, so it
                        takes the line; the path is context and yields to it. */}
                    {waiting > 0 ? (
                      <p className="mt-0.5 text-sm font-semibold" style={{ color: '#7C3AED' }}>
                        🙏 Asked for prayer{waiting > 1 ? ` ×${waiting}` : ''}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-sm text-gray-500">{row.track} path</p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <span
                      className="inline-block rounded-full px-3 py-1 text-xs font-bold"
                      style={{ backgroundColor: `${stage.color}20`, color: stage.color }}
                    >
                      {stage.label}
                    </span>
                    {waiting > 0 && (
                      <p className="mt-1 text-xs text-gray-500">{row.track} path</p>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      {/* `ready` as well as `!error`: still fetching is not the same as nobody,
          and this card was the second place saying so. */}
      {rows.length === 0 && ready && !error && <Card className="mt-6 p-6 text-center text-gray-500">No active pairing yet.</Card>}

      {/* FOLLOW-UPS STAY. They are about the people on this list and nothing
          else, which is what this screen is for. Writing studies, stocking the
          shelf, recommending somebody and the blog desk all moved to the
          Office, because they are work rather than people and they were making
          this page four screens long. See app/office/page.tsx. */}
      <div className="mt-6 space-y-6">
        <LiveFollowUps pairings={rows.map((r) => ({ id: r.id, ds_name: r.ds_name }))} />
      </div>

      {/* Named requests from their own Explorers. A prayer request is about a
          person, so it belongs here rather than in the Office. */}
      <div className="mt-6 space-y-6">
        <LivePrayerForGuide nameFor={(id) => rows.find((r) => r.ds_id === id)?.ds_name ?? 'An Explorer'} />
      </div>

      <div className="mt-6"><LiveBlogFeed selfId={profile?.id} /></div>
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

/**
 * The five rooms of one relationship.
 *
 * Talk is first because it is what a Guide opens this screen to do. Care
 * carries a count, because a prayer request waiting is the one thing here that
 * is asking something of them and a silent tab is how it got missed before.
 */

type GuideTab = 'talk' | 'journey' | 'care' | 'lessons' | 'resources';


export function LiveConversationPage() {
  const [tab, setTab] = useState<GuideTab>('talk');
  const [prayerWaiting, setPrayerWaiting] = useState(0);
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
      const mine = pairs.find((pair) => pair.id === pairingId) ?? null;
      setPairing(mine);
      setMessages(nextMessages);
      setFiles(nextFiles);
      await live.markRead(pairingId);

      // THE COUNT ON THE CARE TAB. Without it the tab is silent about a
      // request waiting, and a silent tab is exactly how prayer requests went
      // unanswered when they were merely further down the page. Failing to
      // load it must never take the conversation down, so it is caught and the
      // badge simply does not draw.
      if (mine) {
        try {
          const requests = await live.listPrayerRequests();
          setPrayerWaiting(
            requests.filter((r) => r.status === 'open' && r.ds_id === mine.ds_id).length,
          );
        } catch {
          setPrayerWaiting(0);
        }
      }
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

  // PUTTING IT BACK. Advance is one tap and a mis-tap had no remedy: the stage
  // is on somebody else's journey, so the only fix left was asking a Director
  // to edit the database. Confirmed, because a correction is still a change to
  // a record about a person, and recorded, because pretending the mistake
  // never happened is what makes a history untrustworthy.
  const stepBack = async () => {
    if (!pairing) return;
    const to = stageInfo(previousStage(pairing.journey_stage) ?? pairing.journey_stage).label;
    if (!confirm(
      `Put ${pairing.ds_name} back to ${to}? This is recorded as a correction, `
      + 'and they are never shown their stage either way.',
    )) return;
    setBusy(true);
    setError('');
    try {
      await live.stepBackStage(pairingId);
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
              {/* THE STAGE, READ ONLY, HERE. The buttons that change it moved
                  to the Journey tab, where the six steps are drawn and the
                  change is in front of the thing it changes. Two Advance
                  buttons on one screen is one too many, and the one at the top
                  changed a stage the Guide could not see. */}
              <div className="shrink-0 text-right">
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-navy">
                  Step {stageInfo(pairing.journey_stage).label}
                </span>
                <p className="mt-1 text-sm font-semibold capitalize text-blue-700">
                  {pairing.track} track
                </p>
              </div>
            </div>
          </Card>
          {error && <Notice tone="error">{error}</Notice>}

          {/* TABS, THE SAME FIVE THE TUTORIAL HAS TAUGHT ALL ALONG.
              The tutorial's version of this screen has had Talk, Journey, Care
              and Resources since it was written; live it was one long scroll,
              so a Guide who learned the job in the demo signed in and found the
              screen they were trained on did not exist. Everything below was
              already here. Nothing is added and nothing is hidden that was not
              already several screens down. */}
          <Tabs<GuideTab>
            tabs={[
              { key: 'talk', label: 'Talk', icon: '💬' },
              { key: 'journey', label: 'Journey', icon: '🎯' },
              { key: 'care', label: 'Care', icon: '🙌', badge: prayerWaiting || undefined },
              { key: 'lessons', label: 'Lessons', icon: '📖' },
              { key: 'resources', label: 'Resources', icon: '📚' },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'talk' && (
            <>
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
              {/* Reporting runs BOTH ways. A Guide receiving something they
                  should not have received needs this as much as an Explorer
                  does, and a route only the junior party can use is one nobody
                  uses. It stays with the conversation it is about. */}
              <LiveReportControl
                subjectId={pairing.ds_id}
                subjectName={pairing.ds_name}
                pairingId={pairing.id}
              />
            </>
          )}

          {tab === 'journey' && (
            <>
              {/* THE SIX STEPS, DRAWN, and the move to the next one under them.
                  The stage was a word in a pill at the top of the page and the
                  button that changes it sat beside it, which tells a Guide what
                  the stage is called and nothing about where it sits in a
                  journey. The tutorial has drawn the path since it was written.
                  Same component, so the demo and the live app cannot drift.

                  THE EXPLORER NEVER SEES THIS. Their own screen says nothing
                  about their stage, on purpose: the journey is a relationship,
                  not a score, and a person who can watch their own progress bar
                  starts performing for it. */}
              <Card className="p-5">
                <h2 className="text-xl font-bold text-navy">Journey</h2>
                <div className="mt-4">
                  <JourneyPath current={pairing.journey_stage as Stage} />
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button
                    variant="gold"
                    onClick={() => void advance()}
                    disabled={busy || pairing.journey_stage === 'commission'}
                  >
                    {pairing.journey_stage === 'commission'
                      ? 'Journey complete'
                      : `Advance to ${stageInfo(nextStage(pairing.journey_stage) ?? 'commission').label} →`}
                  </Button>
                  {/* Only where there is somewhere to go back to. Advancing is
                      one tap and taps go wrong; the correction is recorded
                      rather than erased, so the history stays honest. */}
                  {previousStage(pairing.journey_stage) && (
                    <Button variant="ghost" onClick={() => void stepBack()} disabled={busy}>
                      Undo, step back
                    </Button>
                  )}
                  <p className="text-sm text-gray-500">
                    {pairing.journey_stage === 'commission'
                      ? `${pairing.ds_name.split(' ')[0]} has walked the whole journey.`
                      : `This is recorded in ${pairing.ds_name.split(' ')[0]}'s journey history.`}
                  </p>
                </div>
              </Card>

              {/* The same card the Explorer sees, showing the same meetings.
                  One diary between two people, not two lists that can
                  disagree. */}
              <LiveMeetings pairingId={pairing.id} withName={pairing.ds_name} />
              <DetailChanges
                personId={pairing.ds_id}
                firstName={pairing.ds_name.split(' ')[0]}
              />
            </>
          )}

          {tab === 'care' && (
            <>
              {/* THE PRAYER REQUESTS. Asking for prayer is the most exposed
                  thing an Explorer does in this app, and the answer to it used
                  to be one screen away from where the Guide actually sits.
                  Somebody wrote what they needed prayer for, their Guide
                  replied to messages all evening on a phone, and never saw it,
                  which came back as "the Guide cannot see prayer requests". The
                  row was always there and always readable; it was just never in
                  front of them. The tab carries a count so it is never silent
                  about one waiting. */}
              <LivePrayerForGuide
                alwaysShow
                onlyFor={pairing.ds_id}
                nameFor={() => pairing.ds_name}
                heading={`What ${pairing.ds_name.split(' ')[0]} has asked prayer for`}
              />
              <LiveNotes pairingId={pairing.id} />
            </>
          )}

          {tab === 'lessons' && <LiveStudies />}

          {tab === 'resources' && (
            <LiveLibraryForGuide
              pairings={[{ id: pairing.id, ds_name: pairing.ds_name }]}
            />
          )}
        </div>
      )}
    </LiveAppShell>
  );
}


function MyExplorersAtAGlance({
  rows, waiting,
}: { rows: live.PairingView[]; waiting: Record<string, number> }) {
  const graduated = rows.filter((r) => r.journey_stage === 'commission').length;
  const walking = rows.length - graduated;
  const prayers = Object.values(waiting).reduce((a, b) => a + b, 0);

  // WHAT IS WAITING, before the numbers. A Guide opening this screen is asking
  // "is there anything I should do today", and the honest answer is usually
  // short: somebody asked for prayer, or you are meeting somebody on Thursday.
  const [next, setNext] = useState<live.Meeting | null>(null);
  useEffect(() => {
    let alive = true;
    live.myUpcomingMeetings(1)
      .then((list) => { if (alive) setNext(list[0] ?? null); })
      // A missed meeting lookup must not take the numbers down with it.
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const nameFor = (pairingId: string) =>
    rows.find((r) => r.id === pairingId)?.ds_name ?? 'someone';

  return (
    <Card className="mt-6 p-5">
      {(prayers > 0 || next) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {prayers > 0 && (
            <span className="rounded-full bg-purple-100 px-3 py-1.5 text-sm font-semibold text-purple-900">
              🙏 {prayers} {prayers === 1 ? 'prayer request' : 'prayer requests'} waiting
            </span>
          )}
          {next && (
            <span className="rounded-full bg-gold/25 px-3 py-1.5 text-sm font-semibold text-navy">
              📅 {new Date(next.starts_at).toLocaleDateString(undefined, {
                weekday: 'long', hour: 'numeric', minute: '2-digit',
              })} with {nameFor(next.pairing_id)}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-navy">Your Explorers</h2>
        <p className="text-sm text-gray-500">
          {rows.length} {rows.length === 1 ? 'person' : 'people'} paired with you
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-gold/15 p-4 text-center">
          <p className="text-3xl font-extrabold text-navy">{graduated}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Graduated</p>
        </div>
        <div className="rounded-xl bg-navy/5 p-4 text-center">
          <p className="text-3xl font-extrabold text-navy">{walking}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Still walking</p>
        </div>
      </div>

      <h3 className="mt-5 text-sm font-bold uppercase tracking-wide text-gray-500">By level</h3>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {STAGES.map((stage) => {
          const n = rows.filter((r) => r.journey_stage === stage.key).length;
          return (
            <div
              key={stage.key}
              className={`rounded-xl p-3 text-center ${n === 0 ? 'bg-gray-100' : ''}`}
              // The stage's own colour, faintly, so the levels read as a
              // sequence rather than six identical boxes. Only where somebody
              // is actually standing: an empty level should recede.
              style={n > 0 ? { backgroundColor: `${stage.color}22` } : undefined}
            >
              <p className={`text-2xl font-extrabold ${n === 0 ? 'text-gray-400' : 'text-navy'}`}>{n}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {stage.label}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
