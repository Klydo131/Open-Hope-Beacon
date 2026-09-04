'use client';

// The church library, against a real database. See migration 0008.
//
// A resource is a title and a LINK, and that is the whole answer to a bug the
// sibling deployment shipped: a Guide could "share" a file held in their own
// browser, an Explorer received a title with nothing behind it, and the player
// sat at 0:00. A link opens on any device; a file in IndexedDB opens on one.
//
// The Explorer's view is not a filtered copy of the Guide's. Both call the same
// function and the database returns different rows, because the policy already
// knows who is asking. A filter here would protect nobody.

import { useCallback, useEffect, useState } from 'react';
import * as live from '@/lib/live/data';
import { Button, Card } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';
import { useKeepUp, KEEP_UP_LIBRARY } from '@/lib/live/keep-up';
import { useLiveSession } from '@/lib/live/session';
import { shareItem } from '@/lib/share';

const message = (cause: unknown) =>
  humanError(cause, 'Something went wrong.');

const KIND_ICON: Record<live.MaterialKind, string> = {
  link: '🔗', video: '🎬', audio: '🎧', pdf: '📄', image: '🖼️',
};

function Err({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
      {msg}
    </p>
  );
}

/**
 * Hand a resource to somebody who is not in the app.
 *
 * The library holds LINKS, so this needs no upload and no hosting: it passes
 * the address to the phone's own share sheet — WhatsApp, Messenger, a text,
 * another device — and where there is no share sheet (most desktops) it copies
 * the address and says so. Being told is the point; a button that silently did
 * nothing is the failure lib/share.ts exists to have fixed once.
 */
function SendOut({ onSend }: { onSend: () => void }) {
  return (
    <button
      onClick={onSend}
      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy ring-1 ring-black/10"
    >
      Share outside the app
    </button>
  );
}

function Item({ m, children }: { m: live.Material; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-xl shadow-sm">{KIND_ICON[m.kind]}</span>
        <div className="min-w-0 flex-1">
          <a
            href={m.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-navy underline underline-offset-2"
          >
            {m.title}
          </a>
          {m.description && <p className="mt-0.5 text-sm text-gray-600">{m.description}</p>}
          {/* The address in plain sight. Somebody deciding whether to open a
              link on their phone should be able to see where it goes. */}
          <p className="mt-0.5 truncate text-xs text-gray-400">{m.external_url}</p>
        </div>
      </div>
      {children && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The library, with sharing. For everybody, not only a Guide.
// ---------------------------------------------------------------------------
//
// AN EXPLORER MAY ADD AND SHARE, and until today they could not. The rule was
// that the library is "what the church offers, not a place anybody can post
// into", which is a defensible position and is not the one the owner wants: a
// Guide and an Explorer share links with each other freely, without asking
// anybody. What makes that safe is the record afterwards and the ability to
// stop somebody, not a gate in front of every share. See
// components/LiveLibraryRecord.tsx.
//
// The component keeps its old name because a dozen call sites use it and
// renaming them would be a large diff to settle a comment.
export function LiveLibraryForGuide({ pairings }: { pairings: { id: string; ds_name: string }[] }) {
  const [items, setItems] = useState<live.Material[] | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<live.MaterialKind>('link');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  // Which row has been asked to go. Removing a resource cannot be undone and
  // the shelf is a dense list, so the first tap asks and the second does it —
  // rather than a browser confirm() dialog, which a phone renders as a system
  // box nobody reads and iOS sometimes suppresses entirely.
  const [confirming, setConfirming] = useState('');
  // Which row is open for correction, and the fields while it is. Editing in
  // place rather than in a dialog: the shelf is the context, and a dialog on a
  // phone covers the thing being described.
  const [editing, setEditing] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editKind, setEditKind] = useState<live.MaterialKind>('link');
  // What this person has taken off their own shelf, and whether they are
  // looking at it. A hide with no way back is a trap, and an undo that lives
  // only in the seconds after the tap is barely an undo at all.
  const [putAway, setPutAway] = useState<live.Material[]>([]);
  const [showPutAway, setShowPutAway] = useState(false);
  const { profile } = useLiveSession();

  const load = useCallback(async () => {
    try {
      const [shelf, off] = await Promise.all([
        live.listMaterials(),
        live.listHiddenMaterials(),
      ]);
      setItems(shelf); setPutAway(off); setError('');
    }
    catch (cause) { setItems([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_LIBRARY, load);

  const add = async () => {
    if (!title.trim() || !url.trim() || busy) return;
    setBusy(true); setError(''); setFlash('');
    try {
      await live.addMaterial({ title, url, kind });
      setTitle(''); setUrl(''); setKind('link'); setOpen(false);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  const startEdit = (m: live.Material) => {
    setEditing(m.id);
    setEditTitle(m.title);
    setEditUrl(m.external_url);
    setEditKind(m.kind);
    setError(''); setFlash('');
  };

  const saveEdit = async (m: live.Material) => {
    if (!editTitle.trim() || !editUrl.trim() || busy) return;
    setBusy(true); setError(''); setFlash('');
    try {
      await live.updateMaterial(m.id, { title: editTitle, url: editUrl, kind: editKind });
      setEditing('');
      setFlash(`Saved the changes to \u201c${editTitle.trim()}\u201d.`);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  const remove = async (m: live.Material) => {
    setError(''); setFlash('');
    try {
      const what = await live.deleteMaterial(m.id);
      setConfirming('');
      // SAY WHICH OF THE TWO HAPPENED. One took it from everybody and the other
      // took it from one shelf, and whoever pressed the button is the person
      // who most needs to know which.
      setFlash(what === 'deleted'
        ? `Removed \u201c${m.title}\u201d from the church library.`
        : `Took \u201c${m.title}\u201d off your shelf. It is still there for everybody else.`);
      await load();
    } catch (cause) { setError(message(cause)); }
  };

  /** Put back something taken off this person's own shelf. */
  const putBack = async (m: live.Material) => {
    setError(''); setFlash('');
    try {
      await live.restoreMaterial(m.id);
      setFlash(`Put \u201c${m.title}\u201d back on your shelf.`);
      await load();
    } catch (cause) { setError(message(cause)); }
  };

  /**
   * Send it out of the app: WhatsApp, Messenger, a text, another device.
   *
   * The library holds links, so this shares a link and needs no upload and no
   * hosting. Where the device has no share sheet -- most desktops -- shareItem
   * copies the address instead, and the person is TOLD that is what happened
   * rather than left wondering whether the button did anything, which is the
   * failure lib/share.ts exists to have fixed once.
   */
  const sendOut = async (m: live.Material) => {
    setError(''); setFlash('');
    const result = await shareItem({
      title: m.title,
      text: m.description || m.title,
      url: m.external_url,
    });
    if (result === 'shared') setFlash(`Sent \u201c${m.title}\u201d.`);
    else if (result === 'copied') setFlash('The address is copied. Paste it wherever you like.');
    else if (result === 'cancelled') setFlash('');
    else setError('This browser cannot share for you. Tap the title to open it, then share from there.');
  };

  // WHOSE RESOURCE IT IS. A convenience, not a control: `materials_edit` and
  // `materials_drop` both let the person who added it and anybody who manages
  // the church act on it, and the database refuses everybody else whatever this
  // draws. One rule for both buttons, because the two policies are the same
  // sentence and a screen that split them would drift from the database the
  // first time one of them changed.
  const canManage = (m: live.Material) =>
    !!profile && (m.added_by === profile.id || profile.role === 'admin' || profile.role === 'executive');

  const share = async (materialId: string, pairingId: string, who: string) => {
    setError(''); setFlash('');
    try {
      await live.shareMaterial(materialId, pairingId);
      setFlash(`Shared with ${who}.`);
    } catch (cause) { setError(message(cause)); }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-teal-800/10 bg-gradient-to-r from-teal-50 via-white to-sky-50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-700 text-2xl shadow-sm">📚</span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">Church library</p>
            <h2 className="mt-0.5 text-2xl font-extrabold text-navy">Share a helpful next step.</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">Links your church can send anybody. A link opens on any device.</p>
          </div>
        </div>
        <Button onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Add a resource'}</Button>
      </div>
      <div className="p-5 sm:p-6">

      <Err msg={error} />
      {flash && <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{flash}</p>}

      {/* WHY THIS IS LINKS AND NOT UPLOADS, said plainly rather than left for
          somebody to discover by looking for an upload button that is not
          there. The alternative to saying it is a person concluding the
          feature is broken. */}
      <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm leading-relaxed text-slate-700 ring-1 ring-sky-100">
        <strong>The library holds links, and files stay on your own device.</strong>{' '}
        A file you save in <em>On this device</em> is passed straight from your phone to
        theirs through your phone&rsquo;s own share sheet, so it never sits on a server and
        costs the church nothing. That keeps this app free to run while it is small.
        Storing files for everybody is on the list for when it can be paid for properly.
      </p>

      {open && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
          <label className="block text-sm font-semibold text-navy" htmlFor="mat-title">What is it called</label>
          <input id="mat-title" value={title} onChange={(e) => setTitle(e.target.value)}
            className="tap mt-1 w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600" />

          <label className="mt-3 block text-sm font-semibold text-navy" htmlFor="mat-url">Address</label>
          <input id="mat-url" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="tap mt-1 w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600" />

          <label className="mt-3 block text-sm font-semibold text-navy" htmlFor="mat-kind">Kind</label>
          <select id="mat-kind" value={kind} onChange={(e) => setKind(e.target.value as live.MaterialKind)}
            className="tap mt-1 w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600">
            <option value="link">Link</option>
            <option value="video">Video</option>
            <option value="audio">Audio or music</option>
            <option value="pdf">PDF</option>
            <option value="image">Picture</option>
          </select>

          <div className="mt-4">
            <Button onClick={add} disabled={!title.trim() || !url.trim() || busy}>Add to the library</Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {items === null && <BeaconSpinner inline label="Loading the shelf" className="mt-2" />}
        {items?.length === 0 && !error && (
          <p className="text-sm text-gray-400">Nothing in the library yet.</p>
        )}
        {items?.map((m) => (
          <Item key={m.id} m={m}>
            {pairings.length === 0 ? (
              <span className="text-xs text-gray-400">Nobody to share with yet.</span>
            ) : pairings.map((p) => (
              <button
                key={p.id}
                onClick={() => share(m.id, p.id, p.ds_name)}
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy ring-1 ring-black/10"
              >
                Share with {p.ds_name.split(' ')[0]}
              </button>
            ))}
            {/* OUT OF THE APP, and on every row for every role. The buttons
                above hand a resource to somebody the church has already paired
                you with; this one hands it to a mother, a neighbour, a group
                chat — the people an Explorer actually wants to send a good
                link to, none of whom have accounts. */}
            <SendOut onSend={() => void sendOut(m)} />
            {canManage(m) && editing !== m.id && (
              /* Before the red one, and quiet. Correcting a typo is the far
                 commoner errand and the reversible one. */
              <button
                onClick={() => startEdit(m)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-navy underline"
              >
                Edit
              </button>
            )}
            {/* REMOVE IS FOR EVERYBODY, and does two different things.
                Leadership and whoever added it delete the row; anybody else
                takes it off their OWN shelf and leaves it on everybody's. That
                asymmetry is not a UI trick — deleteMaterial asks the database
                which of the two it is allowed to do — but a person is entitled
                to know which one they are about to press, so the sentence
                below says it BEFORE the tap and the flash repeats it after. */}
            {confirming === m.id ? (
              <>
                <p className="w-full text-xs font-semibold text-gray-600">
                  {canManage(m)
                    ? 'This takes it out of the church library, for everybody.'
                    : 'This takes it off your shelf only. Everybody else keeps it, and you can put it back.'}
                </p>
                <button
                  onClick={() => void remove(m)}
                  className="rounded-full bg-white px-3 py-1 text-xs font-bold text-red-700 ring-1 ring-red-200"
                >
                  Yes, remove it
                </button>
                <button
                  onClick={() => setConfirming('')}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-gray-600 underline"
                >
                  Keep it
                </button>
              </>
            ) : (
              /* Last on the row and the only red thing on it, so the control
                 that cannot be undone is never the first one a thumb finds. */
              <button
                onClick={() => setConfirming(m.id)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-red-700 underline"
              >
                {canManage(m) ? 'Remove from library' : 'Take it off my shelf'}
              </button>
            )}
            {editing === m.id && (
              <div className="mt-1 w-full rounded-xl bg-white p-3 ring-1 ring-navy/10">
                <label className="block text-xs font-semibold text-navy" htmlFor={`edit-title-${m.id}`}>
                  What it is called
                </label>
                <input
                  id={`edit-title-${m.id}`}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="tap mt-1 w-full rounded-xl bg-slate-50 px-3 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
                />
                <label className="mt-2 block text-xs font-semibold text-navy" htmlFor={`edit-url-${m.id}`}>
                  Address
                </label>
                <input
                  id={`edit-url-${m.id}`}
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  inputMode="url"
                  placeholder="https://…"
                  className="tap mt-1 w-full rounded-xl bg-slate-50 px-3 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
                />
                <label className="mt-2 block text-xs font-semibold text-navy" htmlFor={`edit-kind-${m.id}`}>
                  Kind
                </label>
                <select
                  id={`edit-kind-${m.id}`}
                  value={editKind}
                  onChange={(e) => setEditKind(e.target.value as live.MaterialKind)}
                  className="tap mt-1 w-full rounded-xl bg-slate-50 px-3 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="link">Link</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio or music</option>
                  <option value="pdf">PDF</option>
                  <option value="image">Picture</option>
                </select>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => void saveEdit(m)} disabled={!editTitle.trim() || !editUrl.trim() || busy}>
                    {busy ? 'Saving…' : 'Save the changes'}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing('')}>Cancel</Button>
                </div>
              </div>
            )}
          </Item>
        ))}
      </div>

      {/* THE WAY BACK. Only drawn when there is something to come back to, so
          nobody who has never hidden anything is asked to think about it. */}
      {putAway.length > 0 && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
          <button
            onClick={() => setShowPutAway((v) => !v)}
            className="text-sm font-semibold text-navy underline underline-offset-2"
          >
            {showPutAway
              ? 'Hide these again'
              : `You have taken ${putAway.length} off your shelf. Show ${putAway.length === 1 ? 'it' : 'them'}.`}
          </button>
          {showPutAway && (
            <div className="mt-3 space-y-2">
              {putAway.map((m) => (
                <Item key={m.id} m={m}>
                  <button
                    onClick={() => void putBack(m)}
                    className="rounded-full bg-white px-3 py-1 text-xs font-bold text-navy ring-1 ring-black/10"
                  >
                    Put it back
                  </button>
                </Item>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// What the Explorer has been given.
// ---------------------------------------------------------------------------
export function LiveSharedWithMe() {
  const [items, setItems] = useState<live.Material[] | null>(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  // AN EXPLORER WITH NO GUIDE YET SEES ONLY THIS CARD -- the shelf above it is
  // drawn beside a pairing and there is not one. So the way to hand a link to
  // somebody outside the app has to be here too, or the person the church has
  // not paired yet is the one person who cannot pass anything on.
  const sendOut = async (m: live.Material) => {
    setError(''); setFlash('');
    const result = await shareItem({
      title: m.title,
      text: m.description || m.title,
      url: m.external_url,
    });
    if (result === 'shared') setFlash(`Sent \u201c${m.title}\u201d.`);
    else if (result === 'copied') setFlash('The address is copied. Paste it wherever you like.');
    else if (result === 'cancelled') setFlash('');
    else setError('This browser cannot share for you. Tap the title to open it, then share from there.');
  };

  useEffect(() => {
    let alive = true;
    live.listMaterials()
      .then((r) => { if (alive) { setItems(r); setError(''); } })
      .catch((cause) => { if (alive) { setItems([]); setError(message(cause)); } });
    return () => { alive = false; };
  }, []);

  if (items === null) return null;
  if (items.length === 0 && !error) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-blue-800/10 bg-gradient-to-r from-sky-50 via-white to-teal-50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-700 text-2xl shadow-sm">📚</span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-700">Your library</p>
            <h2 className="mt-0.5 text-2xl font-extrabold text-navy">Shared with you</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">From your Guide, for whenever you want it.</p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">
      <Err msg={error} />
      {flash && <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{flash}</p>}
      <div className="mt-3 space-y-2">
        {items.map((m) => (
          <Item key={m.id} m={m}>
            <SendOut onSend={() => void sendOut(m)} />
          </Item>
        ))}
      </div>
      </div>
    </Card>
  );
}
