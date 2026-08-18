'use client';

// Prayer, against a real database. See migration 0007.
//
// Three components because there are three genuinely different views, not three
// styles of one view:
//
//   LiveAskForPrayer  the Explorer's own — raise one, withdraw one
//   LivePrayerForGuide  what their Guide sees, WITH the name
//   LivePrayerWall      what the congregation sees, with NO name
//
// The wall is a different query, not a filtered version of the same one. A
// policy grants whole rows and the row carries ds_id, so serving the wall from
// the table would leave the name one network-tab glance away from anybody who
// can see the request at all.
//
// EVERY LOADER SURFACES ITS ERROR. A refused read and an empty list look
// identical to a reader, and the second is the one somebody has to act on. The
// sibling deployment reported "the prayer feature is not working" and the
// screens could say nothing more than "nothing here", because all three loaders
// ended in a silent catch.

import { useCallback, useEffect, useState } from 'react';
import * as live from '@/lib/live/data';
import { Button, Card } from '@/components/ui';

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Something went wrong.';

const STATUS: Record<live.PrayerStatus, { label: string; className: string }> = {
  open:     { label: 'Open',     className: 'bg-gray-100 text-gray-700' },
  praying:  { label: 'Praying',  className: 'bg-blue-100 text-blue-800' },
  answered: { label: 'Answered', className: 'bg-green-100 text-green-800' },
};

function Chip({ status }: { status: live.PrayerStatus }) {
  const s = STATUS[status];
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${s.className}`}>{s.label}</span>;
}

function Err({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
      {msg}
    </p>
  );
}

// ---------------------------------------------------------------------------
// The Explorer's own corner.
// ---------------------------------------------------------------------------
export function LiveAskForPrayer() {
  const [mine, setMine] = useState<live.PrayerRequestRow[] | null>(null);
  const [body, setBody] = useState('');
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setMine(await live.listPrayerRequests()); setError(''); }
    catch (cause) { setMine([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await live.addPrayerRequest(body, share);
      setBody(''); setShare(false);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">🙏 Ask for prayer</h2>
      <p className="mt-1 text-sm text-gray-500">
        Your Guide sees this. The church only sees it if you say so, and never your name.
      </p>
      <Err msg={error} />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="What would you like prayer for?"
        className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2"
      />
      {/* Off by default. Sharing something private with a congregation is a
          choice somebody makes, never a default they failed to notice. */}
      <label className="mt-2 flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-1" />
        Also share this with the church, without my name
      </label>
      <div className="mt-3">
        <Button onClick={submit} disabled={!body.trim() || busy}>Ask</Button>
      </div>

      <div className="mt-4 space-y-2">
        {mine === null && <p className="text-sm text-gray-400">Loading…</p>}
        {mine?.length === 0 && !error && (
          <p className="text-sm text-gray-400">Nothing yet. You can ask for anything.</p>
        )}
        {mine?.map((r) => (
          <div key={r.id} className="rounded-xl bg-gray-50 p-3">
            <div className="flex items-start gap-2">
              <p className="flex-1 text-sm text-gray-700">{r.body}</p>
              <Chip status={r.status} />
            </div>
            <div className="mt-2 flex items-center gap-3">
              {r.share_with_church && (
                <span className="text-[11px] font-semibold text-gray-400">ON THE CHURCH WALL</span>
              )}
              <span className="flex-1" />
              <button
                onClick={async () => {
                  setError('');
                  try { await live.deletePrayerRequest(r.id); await load(); }
                  catch (cause) { setError(message(cause)); }
                }}
                className="text-xs font-semibold text-gray-500 underline"
              >
                Withdraw
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// What the Guide sees: their own Explorers' requests, with the name.
// ---------------------------------------------------------------------------
export function LivePrayerForGuide({ nameFor }: { nameFor?: (dsId: string) => string }) {
  const [rows, setRows] = useState<live.PrayerRequestRow[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setRows(await live.listPrayerRequests()); setError(''); }
    catch (cause) { setRows([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const move = async (id: string, status: live.PrayerStatus) => {
    setError('');
    try { await live.setPrayerStatus(id, status); await load(); }
    catch (cause) { setError(message(cause)); }
  };

  if (rows !== null && rows.length === 0 && !error) return null;

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">🙏 Prayer requests</h2>
      <p className="mt-1 text-sm text-gray-500">From the people you walk with.</p>
      <Err msg={error} />
      <div className="mt-3 space-y-2">
        {rows === null && <p className="text-sm text-gray-400">Loading…</p>}
        {rows?.map((r) => (
          <div key={r.id} className="rounded-xl bg-gray-50 p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy">{nameFor?.(r.ds_id) ?? 'An Explorer'}</p>
                <p className="mt-0.5 text-sm text-gray-700">{r.body}</p>
              </div>
              <Chip status={r.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['open', 'praying', 'answered'] as live.PrayerStatus[])
                .filter((s) => s !== r.status)
                .map((s) => (
                  <button
                    key={s}
                    onClick={() => move(r.id, s)}
                    className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy ring-1 ring-black/10"
                  >
                    Mark {STATUS[s].label.toLowerCase()}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The church wall. Nobody's name, for anybody.
// ---------------------------------------------------------------------------
export function LivePrayerWall() {
  const [rows, setRows] = useState<live.WallEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    live.listPrayerWall()
      .then((r) => { if (alive) { setRows(r); setError(''); } })
      .catch((cause) => { if (alive) { setRows([]); setError(message(cause)); } });
    return () => { alive = false; };
  }, []);

  if (rows === null) return null;
  if (rows.length === 0 && !error) return null;

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">🙏 Prayer wall</h2>
      <p className="mt-1 text-sm text-gray-500">
        Requests the church has been asked to pray for. Nobody&rsquo;s name is shown.
      </p>
      <Err msg={error} />
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-start gap-2 rounded-xl bg-gray-50 p-3">
            <p className="flex-1 text-sm text-gray-700">{r.body}</p>
            <Chip status={r.status} />
          </div>
        ))}
      </div>
    </Card>
  );
}
