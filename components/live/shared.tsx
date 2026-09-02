'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as live from '@/lib/live/data';
import type { Message, Profile } from '@/lib/types';
import { MessageBox } from '@/components/MessageBox';
import { Linked } from '@/components/Linked';
import { Button, Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';
import { ATTACHMENT_ACCEPT } from '@/lib/live/attachments';
// SPLIT OUT OF components/LiveCorePages.tsx, which had grown to three thousand
// lines holding nineteen components: the signed-out door, the Director's whole
// admin screen, both Guide screens, the Explorer's screen and every small piece
// they share. Nobody can hold that in their head, and a maintainer looking for
// the login form had to know it was in a file called "core pages".
//
// The old module still exists as a re-export, so nothing that imported from it
// had to change. New code should import from the file that actually holds the
// screen.

export const emailLooksValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
export const errorText = (cause: unknown) =>
  humanError(cause, 'Something went wrong. Please try again.');

export type Entry =
  | { kind: 'message'; id: string; at: string; who: string; message: Message }
  | { kind: 'file'; id: string; at: string; who: string; file: live.PairingFile };


/**
 * Was this sent today?
 *
 * A thread of this morning's replies stamped "Sep 2" four times reads as four
 * separate days, which is the opposite of what a timestamp is for.
 */
function sameDay(at: string): boolean {
  const then = new Date(at);
  const now = new Date();
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
}

export function Conversation({
  messages,
  files,
  myId,
  myName,
  theirName,
  body,
  setBody,
  send,
  busy,
  onAttach,
  onRemoveFile,
  attachError,
}: {
  messages: Message[];
  files: live.PairingFile[];
  myId: string;
  /** Both optional: a caller that passes neither gets the thread with no names,
   *  exactly as before, rather than a row of blanks. */
  myName?: string;
  theirName?: string;
  body: string;
  setBody: (value: string) => void;
  send: (event: React.FormEvent) => void;
  busy: boolean;
  onAttach?: (file: File) => void;
  onRemoveFile?: (file: live.PairingFile) => void;
  attachError?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  // THE THREAD OPENS ON THE NEWEST MESSAGE, AND FOLLOWS THE ONE YOU JUST SENT.
  //
  // THE BUG: "when I message, it should always track to the latest." There was
  // no scrolling code here at all. The thread is a fixed-height box with
  // `overflow-y-auto`, so it opened at scroll position ZERO — the oldest
  // message in the conversation — and stayed there. Sending appended the new
  // message below the fold, out of sight. The screenshot shows the reply half
  // cut off behind the composer.
  //
  // On a short conversation nothing looks wrong, which is why it survived: you
  // only meet it once there is more history than fits.
  const box = useRef<HTMLDivElement>(null);
  // A ref on the NEWEST MESSAGE — not on a marker after it.
  //
  // The first attempt put a zero-height marker at the end of the list, and it
  // failed in a way worth writing down: after the box scrolls to its bottom the
  // marker sits ON the bottom edge, at window y≈19, which IS inside the window.
  // `block: 'nearest'` then correctly decides nothing needs to move, while the
  // ninety-five-pixel message directly above it is entirely off the top. The
  // thing that must be visible is the message, so the ref goes on the message.
  //
  // THERE ARE TWO SCROLLPORTS, and fixing only one leaves the bug in place.
  // Scrolling the thread box to its bottom is not enough: focusing the composer
  // scrolls the PAGE down to reveal it, and the composer sits below the thread,
  // so the thread is pushed almost entirely above the top of the window.
  // Measured on a 412x780 phone: the page at 1177 of 1355, and the thread box
  // occupying -257 to 19 — nineteen pixels of a conversation.
  //
  // `scrollIntoView({ block: 'nearest' })` on a marker at the end walks EVERY
  // scrolling ancestor and moves each by the least it can. One call, both
  // scrollports, and nothing moves that did not have to.
  const newestEl = useRef<HTMLDivElement>(null);
  const landed = useRef(false);
  // Whether the reader is at the bottom RIGHT NOW, kept in a ref so watching it
  // does not re-render on every scroll event.
  const following = useRef(true);
  const lastId = useRef<string>('');

  const timeline: Entry[] = [
    ...messages.map((m): Entry => ({
      kind: 'message', id: m.id, at: m.created_at, who: m.sender_id, message: m,
    })),
    ...files.map((f): Entry => ({
      kind: 'file', id: f.id, at: f.created_at, who: f.owner_id, file: f,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  const newest = timeline[timeline.length - 1];
  const newestKey = newest ? `${newest.kind}-${newest.id}` : '';
  const newestIsMine = newest?.who === myId;

  // ARRIVING. `useLayoutEffect` and no animation: you should simply BE at the
  // bottom when the thread appears, the way opening any messaging app works.
  // Smoothly scrolling a page you have only just seen is a page that moves
  // under you.
  useLayoutEffect(() => {
    if (landed.current || timeline.length === 0) return;
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
    newestEl.current?.scrollIntoView({ block: 'nearest' });
    landed.current = true;
    lastId.current = newestKey;
  }, [timeline.length, newestKey]);

  // SOMETHING NEW. Two different cases, and conflating them is the usual bug:
  //
  //   YOU sent it        -> always follow. You pressed send; the thing you
  //                         wrote must be the thing you see.
  //   SOMEBODY ELSE did  -> follow only if you were already at the bottom.
  //                         Yanking a reader who has scrolled up to find what
  //                         was said last Tuesday is worse than not scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el || !newestKey || newestKey === lastId.current) return;
    lastId.current = newestKey;
    if (newestIsMine || following.current) {
      const behavior = landed.current ? 'smooth' : 'auto';
      el.scrollTo({ top: el.scrollHeight, behavior });
      // The page as well, because the composer taking focus drags it away.
      newestEl.current?.scrollIntoView({ block: 'nearest', behavior });
      following.current = true;
    }
  }, [newestKey, newestIsMine]);

  return (
    <Card className="overflow-hidden" data-live-conversation>
      <div className="flex items-center gap-3 border-b border-teal-800/10 bg-gradient-to-r from-teal-50 via-white to-sky-50 px-4 py-3 sm:px-5">
        <span aria-hidden className="grid h-10 w-10 place-items-center rounded-2xl bg-teal-700 text-lg shadow-sm">💬</span>
        <div className="min-w-0">
          <h2 className="font-extrabold text-navy">Private conversation</h2>
          <p className="text-sm text-gray-600">Only the two people walking together can read this.</p>
        </div>
      </div>
      {/* `dvh`, not `vh`. `vh` is the layout viewport, which does not shrink
          when a phone's on-screen keyboard opens — so the thread kept its full
          height and the message you had just written sat underneath the
          keyboard. `dvh` is the part actually visible. The plain `vh` line
          stays underneath it for anything too old to know `dvh`.

          A phone also reaches this card after the header, the relationship
          card and the tabs. Its former 18rem minimum left the composer just
          below the glass even in a one-message conversation. The 12rem phone
          minimum keeps the Send control in reach; `sm` restores the roomier
          thread used by tablets and desktops. */}
      <div
        ref={box}
        data-live-thread
        onScroll={() => {
          const el = box.current;
          if (!el) return;
          // A little slack. Sub-pixel heights and a rubber-band bounce on iOS
          // both mean scrollTop rarely lands exactly on the maximum.
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        aria-live="polite"
        aria-label="Conversation messages"
        className="max-h-[55vh] min-h-48 space-y-2.5 overflow-y-auto overscroll-contain bg-white p-4 sm:min-h-72 sm:p-5 [max-height:55dvh]"
      >
        {timeline.length === 0 && <p className="py-16 text-center text-gray-400">Start with a welcome.</p>}
        {timeline.map((entry, index) => {
          const mine = entry.who === myId;
          const isNewest = index === timeline.length - 1;
          return (
            <div
              key={`${entry.kind}-${entry.id}`}
              ref={isNewest ? newestEl : undefined}
              className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
            >
              {/* TWO TINTS, NOT ONE DARK AND ONE LIGHT.
                  A solid navy bubble for your own messages read as a wall of
                  ink on a phone, and it forced every label inside it to be
                  white — so a timestamp was white-on-navy in one bubble and
                  grey-on-white in the next, and an attachment had to carry two
                  colour schemes. Two soft tints let one set of dark text serve
                  both, which is why the `mine ? text-white` branches below are
                  gone rather than adjusted. */}
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
                  mine
                    ? 'rounded-br-md bg-[#E4F0F5] text-slate-800'
                    : 'rounded-bl-md bg-[#FCEEDF] text-slate-800'
                }`}
              >
                {/* WHO IS SPEAKING, above the words. On a thread of short
                    replies the side a bubble sits on is a weak signal, and it
                    is no signal at all to somebody reading a screenshot of it
                    or a screen reader reading down the list. */}
                {(mine ? myName : theirName) && (
                  <p className={`mb-0.5 text-[13px] font-bold ${mine ? 'text-[#1F7A8C]' : 'text-[#C2762B]'}`}>
                    {(mine ? myName : theirName)?.split(' ')[0]}
                  </p>
                )}
                {entry.kind === 'message' ? (
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                    <Linked text={entry.message.body} />
                  </p>
                ) : (
                  <LiveAttachment
                    file={entry.file}
                    mine={mine}
                    onRemove={mine && onRemoveFile ? () => onRemoveFile(entry.file) : undefined}
                  />
                )}
                {/* The time sits under the words on the reading edge, small and
                    quiet. It carries the date only when the message is not from
                    today: a thread of this morning's replies stamped with the
                    date four times reads as four separate days. */}
                <p className="mt-0.5 text-right text-[11px] text-slate-400">
                  {sameDay(entry.at)
                    ? new Date(entry.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : new Date(entry.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {attachError && (
        <p className="border-t border-black/5 bg-red-50 px-4 py-2 text-sm text-red-800">{attachError}</p>
      )}

      {/* SAID ONCE, WHERE THE DECISION IS MADE. A photo from a phone camera is
          two to four megabytes and this app runs on a free plan that pays for
          every one of them twice, to store and again on every view. It is made
          smaller before it is sent, which nobody can see on a phone screen, and
          the location tag the camera wrote into it is dropped along the way.
          People should be told both, and told here rather than in a policy
          nobody opens. */}
      {onAttach && (
        <p className="border-t border-black/5 bg-slate-50 px-4 py-2 text-xs leading-relaxed text-gray-500">
          Photos are made smaller before they are sent, and the location your camera
          recorded is removed. Up to 10 MB each. For anything larger, share a link.
        </p>
      )}

      <form
        onSubmit={send}
        data-live-composer
        className="flex items-end gap-1.5 border-t border-navy/10 bg-white p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] sm:gap-2 sm:p-4 sm:pb-4"
      >
        {onAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              // A PICKER THAT CAN CHOOSE A FILE THE SERVER WILL REFUSE IS A
              // TRAP. Without this, a Guide could pick a study sheet and only
              // find out it was not allowed after the upload came back with
              // Supabase's own wording about mime types. See
              // lib/live/attachments.ts — this list and the bucket's are the
              // same list and must stay that way.
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                // NOT reset here: WebKit invalidates a File once its input is
                // cleared, and onAttach reads the bytes asynchronously. On
                // Safari and iOS that aborted the upload. The reset moved to
                // the click handler below. See components/Chat.tsx for the
                // whole story; this is the live twin of the same bug.
                const chosen = event.target.files?.[0];
                if (chosen) onAttach(chosen);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              className="shrink-0 px-3"
              disabled={busy}
              onClick={() => {
                // Clear on the way IN, so the same file can be chosen twice
                // without the File being invalidated after it is chosen.
                if (fileRef.current) fileRef.current.value = '';
                fileRef.current?.click();
              }}
              aria-label="Attach a file"
            >
              📎
            </Button>
          </>
        )}
        <MessageBox
          value={body}
          onChange={setBody}
          className="rounded-3xl bg-slate-100 ring-1 ring-navy/5"
        />
        {/* A ROUND SEND, AND STILL A 56px TARGET.
            The word "Send" beside a pill-shaped box made the composer three
            different shapes in a row on a phone. A circle reads as the send
            control in every messaging app people already use, and it gives the
            glyph the whole button rather than a label competing with it.
            `tap` keeps the height floor, `aspect-square` makes it a circle
            rather than an oval, and the aria-label is what a screen reader and
            every test that asks for a button called Send actually read — the
            arrow is decorative and is hidden from both. */}
        <button
          type="submit"
          disabled={busy || !body.trim()}
          aria-label="Send"
          className="tap flex aspect-square shrink-0 self-end items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: '#1F7A8C' }}
        >
          <span aria-hidden className="text-lg leading-none">➤</span>
        </button>
      </form>
    </Card>
  );
}

/**
 * One attachment, opened through a signed URL.
 *
 * The bucket is private, so these have no permanent address — the URL is minted
 * per view and expires in an hour. That is also why it is fetched on the click
 * rather than for every file in the thread at once: a long conversation would
 * otherwise mint dozens of signed URLs nobody opens.
 */

// A picture looks like a picture, and a voice note plays.
//
// THE REPORT, with a screenshot of a photograph rendered as a blue underlined
// filename: "I should see the image or video in my chat, not the document
// file please."
//
// Everything sent into a conversation was drawn the same way, as a paperclip
// and a filename, whether it was a study sheet or a photograph of somebody's
// grandchild. The name a phone gives a photo is `20260901_110714.jpg`, which
// tells the person receiving it nothing at all, and opening it meant leaving
// the conversation for a new browser tab.
//
// THREE SHAPES, DECIDED BY THE MIME TYPE THE DATABASE ALREADY STORES:
//
//   image  -> the picture, tappable for the full size
//   audio  -> a player, because a voice note is for listening to
//   other  -> the filename, which is right for a study sheet
//
// LAZY, AND THAT IS NOT A DETAIL. A private file is fetched through a signed
// link that no cache will keep, so every picture drawn is paid for in egress
// every single time the thread is opened. `loading="lazy"` means a photo from
// March is not fetched by somebody reading today's message, and the audio
// player is told to load nothing until it is pressed.
//
// HEIC IS WHY THERE IS A FALLBACK RATHER THAN A CHECK. Apple's format is in the
// upload allowlist and Safari can draw it; Chrome and Firefox cannot. Rather
// than special-case it, anything that fails to load falls back to the filename
// link, which also covers a signed URL that expired while the tab sat open.
//
// VIDEO IS NOT HERE because it cannot be uploaded: it is deliberately absent
// from the bucket's allowlist. One phone video is the storage of a hundred
// photographs and it would be paid for again on every view, which is the whole
// reason this church can run on a free plan. A video is shared as a link.
export function LiveAttachment({
  file,
  mine,
  onRemove,
}: {
  file: live.PairingFile;
  mine: boolean;
  onRemove?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [url, setUrl] = useState('');
  // Set when the browser could not draw it: an unsupported format, or a link
  // that expired. Either way the filename still works.
  const [broken, setBroken] = useState(false);

  const isImage = /^image\//i.test(file.mime);
  const isAudio = /^audio\//i.test(file.mime);
  const showsItself = (isImage || isAudio) && !broken;

  // Signed at render time and never stored, for the same reason as everywhere
  // else in this app: a stored signed URL expires and becomes a broken picture
  // with nothing to explain it.
  useEffect(() => {
    if (!showsItself) return;
    let alive = true;
    live.pairingFileUrl(file.path)
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setBroken(true); });
    return () => { alive = false; };
  }, [file.path, showsItself]);

  const open = async () => {
    setBusy(true);
    setFailed('');
    try {
      const fresh = await live.pairingFileUrl(file.path);
      window.open(fresh, '_blank', 'noopener,noreferrer');
    } catch {
      setFailed('That file could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const size = file.size >= 1024 * 1024
    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(file.size / 1024))} KB`;

  const caption = (
    <span className="block text-[11px] text-slate-500">
      {busy ? 'Opening…' : size}
      {onRemove && (
        <>
          {' · '}
          <button type="button" onClick={onRemove} className="font-semibold text-red-700 underline underline-offset-2">Remove</button>
        </>
      )}
    </span>
  );

  if (isImage && !broken) {
    return (
      <span className="block">
        <button
          type="button"
          onClick={() => void open()}
          className="block overflow-hidden rounded-xl"
          // The filename is the accessible name. A photo from a phone is called
          // 20260901_110714.jpg, which is nothing to a screen reader, so it is
          // said as what it is instead.
          aria-label={`Open the picture ${file.title}`}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={file.title}
              loading="lazy"
              onError={() => setBroken(true)}
              className="block max-h-72 rounded-xl bg-black/10 object-cover"
            />
          ) : (
            // A box of the right shape while it arrives, rather than the text
            // jumping down the moment the picture lands.
            <span className="block h-32 w-44 animate-pulse rounded-xl bg-black/10" />
          )}
        </button>
        {caption}
        {failed && <span className="block text-[11px] text-red-600">{failed}</span>}
      </span>
    );
  }

  if (isAudio && !broken) {
    return (
      <span className="block">
        <span className="block break-words text-sm font-semibold text-navy">
          🎧 {file.title}
        </span>
        {url ? (
          // preload="none": a voice note is not fetched until somebody presses
          // play, which on a thread with several of them is the difference
          // between one download and all of them.
          <audio
            controls
            preload="none"
            src={url}
            onError={() => setBroken(true)}
            className="mt-1 w-full"
          />
        ) : (
          <span className="block text-[11px] text-slate-500">Loading…</span>
        )}
        {caption}
      </span>
    );
  }

  return (
    <span className="block">
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="block break-words text-left font-semibold underline underline-offset-2 text-navy"
      >
        📎 {file.title}
      </button>
      {caption}
      {failed && <span className="block text-[11px] text-red-600">{failed}</span>}
    </span>
  );
}


export function Field({
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


export function SelectPerson({
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


export function Notice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return (
    <p className={`rounded-xl px-4 py-3 text-sm ring-1 ${tone === 'error' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-green-50 text-green-800 ring-green-200'}`}>
      {children}
    </p>
  );
}

// Build-time assertion: this module belongs only to configured deployments.

/**
 * One kind of person, on their own.
 *
 * See docs/DESIGN.md rule 1. Guides and Explorers were a single list a Director
 * scrolled and sorted in their head. They are different jobs and they answer
 * different questions: a Guide has a load and a cap of five, an Explorer has a
 * Guide and a stage. The list that answers neither is the one nobody reads.
 */
