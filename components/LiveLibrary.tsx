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
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-lg">{KIND_ICON[m.kind]}</span>
        <div className="min-w-0 flex-1">
          <a
            href={m.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-navy underline"
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
// The Guide's library, with sharing.
// ---------------------------------------------------------------------------
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
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy">📚 Church library</h2>
          <p className="text-sm text-gray-500">
            Links your church can send anybody. A link opens on any device.
          </p>
        </div>
        <Button onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Add'}</Button>
      </div>

      <Err msg={error} />
      {flash && <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{flash}</p>}

      {open && (
        <div className="mt-4 rounded-xl bg-navy/5 p-4">
          <label className="block text-sm font-semibold text-navy" htmlFor="mat-title">What is it called</label>
          <input id="mat-title" value={title} onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2" />

          <label className="mt-3 block text-sm font-semibold text-navy" htmlFor="mat-url">Address</label>
          <input id="mat-url" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2" />

          <label className="mt-3 block text-sm font-semibold text-navy" htmlFor="mat-kind">Kind</label>
          <select id="mat-kind" value={kind} onChange={(e) => setKind(e.target.value as live.MaterialKind)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2">
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
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📚 Shared with you</h2>
      <p className="mt-1 text-sm text-gray-500">From your Guide, for whenever you want it.</p>
      <Err msg={error} />
      <div className="mt-3 space-y-2">
        {items.map((m) => <Item key={m.id} m={m} />)}
      </div>
    </Card>
  );
}
