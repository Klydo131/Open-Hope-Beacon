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

  const load = useCallback(async () => {
    try { setItems(await live.listMaterials()); setError(''); }
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
          </Item>
        ))}
      </div>
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
      <div className="mt-3 space-y-2">
        {items.map((m) => <Item key={m.id} m={m} />)}
      </div>
      </div>
    </Card>
  );
}
