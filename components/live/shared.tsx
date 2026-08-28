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


export function Conversation({
  messages,
  files,
  myId,
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
    <Card className="overflow-hidden">
      {/* `dvh`, not `vh`. `vh` is the layout viewport, which does not shrink
          when a phone's on-screen keyboard opens — so the thread kept its full
          height and the message you had just written sat underneath the
          keyboard. `dvh` is the part actually visible. The plain `vh` line
          stays underneath it for anything too old to know `dvh`. */}
      <div
        ref={box}
        onScroll={() => {
          const el = box.current;
          if (!el) return;
          // A little slack. Sub-pixel heights and a rubber-band bounce on iOS
          // both mean scrollTop rarely lands exactly on the maximum.
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="max-h-[55vh] min-h-72 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-5 [max-height:55dvh]"
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
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? 'bg-navy text-white' : 'bg-gray-100 text-gray-800'}`}>
                {entry.kind === 'message' ? (
                  <p className="whitespace-pre-wrap break-words">
                    <Linked text={entry.message.body} />
                  </p>
                ) : (
                  <LiveAttachment
                    file={entry.file}
                    mine={mine}
                    onRemove={mine && onRemoveFile ? () => onRemoveFile(entry.file) : undefined}
                  />
                )}
                <p className={`mt-1 text-[11px] ${mine ? 'text-white/50' : 'text-gray-400'}`}>
                  {new Date(entry.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {attachError && (
        <p className="border-t border-black/5 bg-red-50 px-4 py-2 text-sm text-red-800">{attachError}</p>
      )}

      <form onSubmit={send} className="flex items-end gap-2 border-t border-black/5 p-3 sm:p-4">
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
        <MessageBox value={body} onChange={setBody} />
        <Button type="submit" variant="gold" disabled={busy || !body.trim()} className="shrink-0 self-end">Send</Button>
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

  const open = async () => {
    setBusy(true);
    setFailed('');
    try {
      const url = await live.pairingFileUrl(file.path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setFailed('That file could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const size = file.size >= 1024 * 1024
    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(file.size / 1024))} KB`;

  return (
    <span className="block">
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className={`block break-words text-left font-semibold underline underline-offset-2 ${mine ? 'text-white' : 'text-navy'}`}
      >
        📎 {file.title}
      </button>
      <span className={`block text-[11px] ${mine ? 'text-white/60' : 'text-gray-500'}`}>
        {busy ? 'Opening…' : size}
        {onRemove && (
          <>
            {' · '}
            <button type="button" onClick={onRemove} className="underline underline-offset-2">Remove</button>
          </>
        )}
      </span>
      {failed && <span className={`block text-[11px] ${mine ? 'text-red-200' : 'text-red-600'}`}>{failed}</span>}
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
