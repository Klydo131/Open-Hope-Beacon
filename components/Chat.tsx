'use client';

import { useEffect, useRef, useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { NAVY } from '@/lib/brand';
import { emitQuest } from '@/lib/quest';
import type { Message, PairingMedia } from '@/lib/types';
import { Attachment } from './Attachment';
import { ReportDialog } from './ReportDialog';
import { Button } from './ui';
import { MessageBox } from '@/components/MessageBox';

/**
 * One thing in the conversation, whichever kind it is.
 *
 * A THREAD IS A SEQUENCE OF EVENTS, NOT TWO LISTS. This screen used to render
 * every message and then every attachment, in two passes — so a file always
 * appeared at the very bottom no matter when it was sent. A Guide who attached
 * a study sheet and then received a reply saw the reply above their own
 * attachment, and the timestamps underneath said the opposite. On a thread with
 * any history the file ends up nowhere near the message it belongs to.
 *
 * Sorting cannot fix that while the two are separate arrays, so they are not
 * separate any more: both become entries with a time, and the time is the only
 * thing that decides the order.
 */
type Entry =
  | { kind: 'message'; id: string; at: string; who: string; message: Message }
  | { kind: 'media'; id: string; at: string; who: string; media: PairingMedia };

// Private 1:1 thread scoped to a single pairing. In the demo, messages live in
// the store; in production this is the `messages` table with Realtime and RLS
// that only lets the two participants read or write.
export function Chat({ pairingId }: { pairingId: string }) {
  const { db, userId, sendMessage, markMessagesRead, attachMedia, removeMedia, mediaFor,
    reportPerson } = useDemo();
  const [text, setText] = useState('');
  const [reporting, setReporting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // mediaFor applies the rule; this screen never filters db.pairing_media
  // itself. In a real deployment the equivalent filter is a database policy,
  // and a screen that did its own filtering would be the thing that quietly
  // disagreed with it.
  const media = mediaFor(pairingId);

  const messages = db.messages.filter((m) => m.pairing_id === pairingId);

  // ISO 8601 sorts correctly as plain text down to the millisecond, which is
  // the resolution both of these are stamped at. The id is a tie-break so that
  // two things created in the same millisecond keep ONE order instead of
  // swapping places between renders — a thread that reshuffles itself while
  // you are reading it is worse than one in the wrong order.
  const timeline: Entry[] = [
    ...messages.map((m): Entry => ({
      kind: 'message', id: m.id, at: m.created_at, who: m.sender_id, message: m,
    })),
    ...media.map((m): Entry => ({
      kind: 'media', id: m.id, at: m.created_at, who: m.owner_id, media: m,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline.length]);

  // Reading the thread is what marks it read — on open, and again whenever a
  // message lands while it is on screen. markMessagesRead is a no-op when
  // there is nothing unread, so this does not loop.
  useEffect(() => {
    markMessagesRead(pairingId);
  }, [pairingId, messages.length, markMessagesRead]);

  const nameOf = (id: string) =>
    db.profiles.find((p) => p.id === id)?.full_name ?? 'Unknown';

  // The other person in this pairing — the only person this conversation's
  // Report control can be about, which is why it takes no "who" step.
  const pairing = db.pairings.find((p) => p.id === pairingId);
  const otherId =
    pairing && userId
      ? (pairing.dm_id === userId ? pairing.ds_id : pairing.dm_id)
      : '';

  if (reporting && otherId) {
    return (
      <ReportDialog
        subjectName={nameOf(otherId)}
        onCancel={() => setReporting(false)}
        onSubmit={(reason, detail) =>
          reportPerson({ subjectId: otherId, reason, detail, pairingId })
        }
      />
    );
  }

  return (
    <div className="flex h-[26rem] flex-col rounded-2xl bg-white ring-1 ring-black/5">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {timeline.length === 0 && (
          <p className="mt-8 text-center text-gray-400">
            No messages yet. Say hello.
          </p>
        )}
        {timeline.map((entry) => {
          const mine = entry.who === userId;
          return (
            <div
              key={`${entry.kind}-${entry.id}`}
              // Read by tests/e2e/chat-order.js to check the rendered order
              // against the order things were actually sent. A plain div, so
              // the attribute reaches the DOM — Button would have dropped it.
              data-chat-entry={entry.kind}
              className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
            >
              {entry.kind === 'message' ? (
                <div
                  className="max-w-[80%] rounded-2xl px-4 py-2 text-lg"
                  style={
                    mine
                      ? { backgroundColor: NAVY, color: '#fff' }
                      : { backgroundColor: '#EEF1F7', color: '#1a2233' }
                  }
                >
                  {entry.message.body}
                </div>
              ) : (
                <Attachment
                  media={entry.media}
                  onRemove={mine ? () => removeMedia(entry.media.id) : undefined}
                />
              )}
              {/* One footer for both kinds, so a file and a message that were
                  sent together read as the same person speaking. */}
              <span className="mt-1 px-1 text-xs text-gray-400">
                {mine ? 'You' : nameOf(entry.who)} ·{' '}
                {new Date(entry.at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/*
        DELIBERATELY OUTSIDE THE FORM BELOW, and it cost two broken test runs to
        learn why.

        [data-quest="chat-send"] is the tutorial's anchor, and other suites reach
        into it positionally: the message box is
        `[data-quest="chat-send"] input`.first() and Send is
        `[data-quest="chat-send"] button`.first(). Putting the hidden file input
        inside captured the first selector, so typing timed out. Moving only the
        input and leaving the Attach button inside then captured the second, so
        the suite clicked Attach instead of Send and the message was never sent —
        a silent failure, because nothing on screen looked wrong.

        So the whole attach control lives out here. That region contains exactly
        one input and one button, and it should stay that way.
      */}
      <div className="flex items-center gap-2 border-t border-black/5 px-3 pt-2">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset first: picking the same file twice in a row fires no change
            // event otherwise, and the second attempt looks broken.
            e.target.value = '';
            if (file) attachMedia(pairingId, file);
          }}
        />
        {/* Plain text label, no aria-label: Button takes a fixed prop list and
            would drop one silently — see the comment in ui.tsx. */}
        <Button
          type="button"
          variant="ghost"
          className="px-3 text-base"
          onClick={() => fileRef.current?.click()}
        >
          Attach a file
        </Button>
        {/* A plain link, not a button, and pushed to the far end. Reporting
            somebody must be reachable without hunting for it and must never be
            hit by a thumb aiming at Send or Attach. */}
        {otherId && (
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="ml-auto shrink-0 px-2 text-sm text-gray-400 underline underline-offset-2 hover:text-red-600"
          >
            Report
          </button>
        )}
      </div>

      <form
        // The tutorial says "type in the highlighted box and send", so the
        // highlight has to cover the box as well as the button — it used to
        // ring only Send, which pointed at the wrong half of the instruction.
        data-quest="chat-send"
        // items-end so Send stays level with the bottom of a box that grows.
        className="flex items-end gap-2 border-t border-black/5 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          sendMessage(pairingId, text);
          emitQuest('beacon:message');
          setText('');
        }}
      >
        <MessageBox
          value={text}
          onChange={setText}
          placeholder="Type a message…"
          className="text-lg"
        />
        <span className="shrink-0 self-end">
          <Button type="submit" disabled={!text.trim()} className="px-4 sm:px-5">
            Send
          </Button>
        </span>
      </form>
    </div>
  );
}
