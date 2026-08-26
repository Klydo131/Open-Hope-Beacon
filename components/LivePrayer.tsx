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
import { BeaconSpinner } from '@/components/BeaconLoader';

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
      await live.addPrayerRequest(body, false);
      setBody('');
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">🙏 Ask for prayer</h2>
      <p className="mt-1 text-sm text-gray-500">
        This goes to the Guide walking with you, and to nobody else.
      </p>
      <Err msg={error} />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="What would you like prayer for?"
        className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2"
      />
      {/* THE CHOICE TO BROADCAST IS GONE, and the request now goes to one
          person: the Guide walking with them.

          Anonymous is not the same as private. A congregation of forty reading
          "please pray for my marriage" can usually work out who wrote it, and
          the person who ticked the box was told only that their name would not
          be shown. Somebody exploring faith should be able to ask for prayer
          without weighing that up first. */}
      <div className="mt-3">
        <Button onClick={submit} disabled={!body.trim() || busy}>Ask</Button>
      </div>

      <div className="mt-4 space-y-2">
        {mine === null && <BeaconSpinner inline label="Loading" className="mt-2" />}
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
export function LivePrayerForGuide({
  nameFor,
  onlyFor,
  heading,
}: {
  nameFor?: (dsId: string) => string;
  /**
   * Narrow the list to one Explorer.
   *
   * WHY THIS EXISTS. Prayer requests lived only on the Guide's dashboard. A
   * Guide spends their time inside a conversation, and the request written by
   * the very person they are talking to was on a different screen -- so an
   * Explorer wrote "please pray for my mother", the Guide answered messages all
   * evening, and never saw it. Reported as "the Guide cannot see prayer
   * requests"; the row was always there and readable, just never in front of
   * them.
   */
  onlyFor?: string;
  heading?: string;
}) {
  const [rows, setRows] = useState<live.PrayerRequestRow[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const all = await live.listPrayerRequests();
      setRows(onlyFor ? all.filter((r) => r.ds_id === onlyFor) : all);
      setError('');
    }
    catch (cause) { setRows([]); setError(message(cause)); }
  }, [onlyFor]);
  useEffect(() => { void load(); }, [load]);

  if (rows !== null && rows.length === 0 && !error) return null;

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">🙏 {heading ?? 'Prayer requests'}</h2>
      <p className="mt-1 text-sm text-gray-500">
        {onlyFor ? 'What they have asked you to pray for.' : 'From the people you walk with.'}
      </p>
      <Err msg={error} />
      <div className="mt-3 space-y-2">
        {rows === null && <BeaconSpinner inline label="Loading" className="mt-2" />}
        {rows?.map((r) => (
          <div key={r.id} className="rounded-xl bg-gray-50 p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy">{nameFor?.(r.ds_id) ?? 'An Explorer'}</p>
                <p className="mt-0.5 text-sm text-gray-700">{r.body}</p>
              </div>
            </div>
            {/* THE STATUS BUTTONS ARE GONE, AND THAT IS THE POINT.
                "Mark praying" and "Mark answered" asked a Guide to file
                somebody's mother's illness under a workflow state. Prayer is
                not a ticket queue, and a request sitting on "open" made it look
                like one that had been ignored. What a Guide does with this is
                pray, and then talk to the person in the conversation directly
                above. */}
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
