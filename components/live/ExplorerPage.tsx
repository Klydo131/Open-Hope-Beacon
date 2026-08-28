'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NAVY } from '@/lib/brand';
import { useLiveSession } from '@/lib/live/session';
import * as live from '@/lib/live/data';
import { LiveReportControl } from '@/components/LiveSafeguarding';
import type { Message, Profile } from '@/lib/types';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveBlogFeed } from '@/components/LiveBlog';
import { LiveAskForPrayer } from '@/components/LivePrayer';
import { LiveMeetings } from '@/components/LiveMeetings';
import { useDraft, clearDraft } from '@/lib/drafts';
import { LiveSharedWithMe } from '@/components/LiveLibrary';
import { LiveStudies } from '@/components/LiveStudies';
import { Avatar, Card } from '@/components/ui';
import { Conversation, Notice, errorText } from '@/components/live/shared';
import { LiveAnnouncements } from '@/components/LiveAnnouncements';

// SPLIT OUT OF components/LiveCorePages.tsx, which had grown to three thousand
// lines holding nineteen components: the signed-out door, the Director's whole
// admin screen, both Guide screens, the Explorer's screen and every small piece
// they share. Nobody can hold that in their head, and a maintainer looking for
// the login form had to know it was in a file called "core pages".
//
// The old module still exists as a re-export, so nothing that imported from it
// had to change. New code should import from the file that actually holds the
// screen.

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

        {/* WHO IS WALKING WITH YOU, FIRST, and on this screen only.
            On a Director's or a Guide's home the church's writing comes first,
            because their job is the church. An Explorer opening My Journey is
            not looking for the church, they are looking for their person; the
            whole design says the journey is a relationship, and then the page
            opened on a list of everybody else's posts. The Guide's name goes
            above the blogs here. */}
        {pairing && <GuideCard pairing={pairing} />}

        {/* THE CHURCH, BETWEEN THE PERSON AND THE TALKING. An Explorer opens
            this screen looking for their Guide, so the name stays first. What
            the church has pinned comes next, above the conversation: it is the
            one thing on here that did not come from the two of them, and below
            the thread nobody would ever scroll to it. Draws nothing when
            there is nothing pinned. */}
        <LiveAnnouncements hideWhenEmpty />

        {/* Cases moved to their own room, /cases, in the rail on every screen.
            An Explorer called into one is the person in it with the least
            standing, so it has to be somewhere they can find without being
            told, and a card partway down this page was not that. */}

        {!pairing ? (
          <Card className="p-6 text-center">
            <h2 className="text-xl font-bold text-navy">Your Guide is being arranged</h2>
            <p className="mt-2 text-gray-500">Your church will connect one person with you soon.</p>
          </Card>
        ) : (
          <>
            {/* The card that used to sit here has moved to the top of the page.
                Two copies of a person's Guide on one screen is not emphasis. */}
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
        {/* ARRANGING A TIME IS PART OF THE RELATIONSHIP, so it sits with the
            conversation rather than in a menu. Both people see the same card
            and either may propose; migration 0009's policies were written for
            exactly that and nothing had ever called them. */}
        {pairing && <LiveMeetings pairingId={pairing.id} withName={pairing.dm_name} />}
        <LiveSharedWithMe />
        <LiveStudies />

        {/* READ, THEN ASK. Writing moved to the Publish room, which every role
            has: this screen is somebody's journey, and their own blog desk sat
            on it because there was nowhere else to put it.

            Asking for prayer is last, at the foot of the page, because it is
            the most exposed thing anybody does in this app and should not be
            the first thing on the screen every time they open their journey. */}
        <LiveBlogFeed selfId={profile?.id} />
        <LiveAskForPrayer />
      </div>
    </LiveAppShell>
  );
}

/**
 * THE GUIDE IS A PERSON, AND THE SCREEN HAS TO SAY SO.
 *
 * This card was a name on a line. An Explorer arriving at an app that pairs
 * them with a stranger has no way to tell, from a name alone, whether anybody
 * is on the other end — and the one thing this whole product rests on is that
 * they believe somebody is. A face, a city and what that person cares about
 * turn "your Guide" into someone they could recognise in a room.
 *
 * WHAT IT SHOWS IS WHAT THE GUIDE WROTE ABOUT THEMSELVES. Picture, city, work
 * and interests are all fields a Guide filled in on their own profile knowing
 * their church and the people they walk with would read them. No birthday, no
 * contact details, no journey stage, nothing anybody else recorded about them.
 * The short column list in `pairedProfile` is the enforcement; this component
 * could not render more than that if it tried.
 *
 * It draws the name first and fills the rest in when it arrives, so a slow
 * network shows a name instead of a spinner. If the profile read fails the
 * card stays exactly as it was before this existed — a name and the privacy
 * line — because a broken picture is worse than no picture.
 */
function GuideCard({ pairing }: { pairing: live.MyPairing }) {
  const [guide, setGuide] = useState<Profile | null>(null);
  const [photo, setPhoto] = useState('');

  useEffect(() => {
    let alive = true;
    void live
      .pairedProfile(pairing.dm_id)
      .then((found) => { if (alive) setGuide(found); })
      // Silent on purpose: the name above is already on the screen and is the
      // part that matters. An error banner here would be about our plumbing,
      // not about anything the Explorer can act on.
      .catch(() => {});
    return () => { alive = false; };
  }, [pairing.dm_id]);

  // Signed at render time, never stored — a stored signed URL expires and
  // becomes a broken picture with nothing to explain it.
  const photoPath = guide?.photo_path;
  useEffect(() => {
    let alive = true;
    void live.avatarUrl(photoPath).then((url) => { if (alive) setPhoto(url); }).catch(() => {});
    return () => { alive = false; };
  }, [photoPath]);

  const topics = (guide?.topics_of_interest ?? []).filter(Boolean).slice(0, 6);
  const place = [guide?.city_of_residence, guide?.work_industry].filter(Boolean).join(' \u00b7 ');

  return (
    <Card className="p-5">
      <p className="text-sm text-gray-500">Walking with you</p>
      {/* Wraps rather than shrinks: at 320px a 64px circle and a long name do
          not fit on one line, and a squashed face reads as a placeholder. */}
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <Avatar
          name={pairing.dm_name}
          size={64}
          photo={photo || undefined}
          avatar={guide?.avatar}
        />
        <div className="min-w-0">
          <p className="text-xl font-bold text-navy">{pairing.dm_name}</p>
          <p className="text-sm text-gray-500">Your Guide{place && <> &middot; {place}</>}</p>
        </div>
      </div>

      {topics.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-gray-500">Cares about</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {topics.map((topic) => (
              <span key={topic} className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-navy">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-sm text-gray-500">Only you and your Guide can read this conversation.</p>
    </Card>
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
