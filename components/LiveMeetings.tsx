'use client';

// Booking a time together, for the two people in a pairing.
//
// THE GAP THIS CLOSES. The tutorial has had this card since the beginning and
// the live app never did. What live shipped instead was "Your reminders": a
// private checklist only the Guide could see. Those are different things. A
// reminder is a Guide talking to themselves. A meeting is two people agreeing
// on a time, and agreeing is the whole point of an app about walking with
// somebody.
//
// The database was ready. Migration 0009 created `meetings` with a title, a
// time, online or in person, a place, notes and a status, and wrote policies
// that let BOTH people read, create, edit and cancel. Nothing about this needed
// designing; it needed building.
//
// THE EXPLORER CAN PROPOSE, NOT ONLY ACCEPT. That is deliberate and it is what
// the policies already allowed. Somebody who can only ever be summoned is not
// walking alongside anyone.

import { useCallback, useEffect, useState } from 'react';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { Button, Card } from '@/components/ui';

/**
 * A link to a map, never an embedded one.
 *
 * An embed needs a Google Maps key, which means a billing account and a key
 * that reaches every browser. A link opens the map app the person already has,
 * already signed in, with their own saved places. The location is free text
 * somebody typed, so it is encoded; whitespace alone yields no link rather than
 * a map of nowhere.
 */
function mapsUrl(place: string | null): string | null {
  const q = (place || '').trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  });
}

/** Within the next day, and not already past. Worth saying out loud. */
function soon(iso: string): boolean {
  const t = new Date(iso).getTime();
  const now = Date.now();
  return t > now && t - now < 24 * 60 * 60 * 1000;
}

export function LiveMeetings({ pairingId, withName }: { pairingId: string; withName?: string }) {
  const { profile } = useLiveSession();
  const me = profile?.id ?? '';
  const [rows, setRows] = useState<live.Meeting[] | null>(null);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [mode, setMode] = useState<live.MeetingMode>('online');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await live.listMeetings(pairingId));
      setError('');
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : 'Could not load meetings.');
    }
  }, [pairingId]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'That did not work.'); }
    finally { setBusy(false); }
  };

  // Cancelled ones are kept but not shown: somebody who arranged an afternoon
  // around this needs to know it was called off, and that is what the message
  // in the conversation is for. A permanent list of things that are not
  // happening is not a diary.
  const upcoming = (rows ?? [])
    .filter((m) => m.status !== 'cancelled'
      && new Date(m.starts_at).getTime() > Date.now() - 60 * 60 * 1000);

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📅 Meetings</h2>
      <p className="mt-1 text-sm text-gray-500">
        Arrange a call or a time to study together.
        {withName ? ` You and ${withName} both see this.` : ' You both see this.'}
      </p>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
      )}

      <div className="mt-3 grid gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is it about?"
          className="rounded-xl border border-gray-300 px-3 py-2"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            aria-label="When"
            className="rounded-xl border border-gray-300 px-3 py-2"
          />
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as live.MeetingMode)}
            aria-label="Online or in person"
            className="rounded-xl border border-gray-300 px-3 py-2"
          >
            <option value="online">Online (call)</option>
            <option value="in_person">In person</option>
          </select>
        </div>
        {mode === 'in_person' && (
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where? A church hall, a café, an address"
            className="rounded-xl border border-gray-300 px-3 py-2"
          />
        )}
        <div>
          <Button
            variant="gold"
            disabled={busy || !startsAt}
            onClick={() => act(async () => {
              await live.scheduleMeeting(pairingId, {
                title, startsAt: new Date(startsAt).toISOString(), mode, location,
              });
              setTitle(''); setStartsAt(''); setLocation('');
            })}
          >
            {busy ? 'Saving…' : 'Propose this time'}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {rows !== null && upcoming.length === 0 && (
          <p className="text-sm text-gray-400">Nothing arranged yet.</p>
        )}
        {upcoming.map((m) => {
          const map = mapsUrl(m.location);
          const mine = m.created_by === me;
          return (
            <div key={m.id} className="rounded-xl bg-gray-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-navy">{m.title}</p>
                {soon(m.starts_at) && (
                  <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-navy">Soon</span>
                )}
                {m.status === 'proposed' && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                    Waiting to be confirmed
                  </span>
                )}
                {m.status === 'confirmed' && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                    Confirmed
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-600">
                {when(m.starts_at)} · {m.mode === 'online' ? 'Online call' : 'In person'}
                {m.mode === 'in_person' && m.location ? ` · ${m.location}` : ''}
              </p>
              {map && (
                <a
                  href={map}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-sm font-semibold text-blue-700 underline underline-offset-2"
                >
                  Open in maps ↗
                </a>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {/* ONLY THE OTHER PERSON CONFIRMS. Confirming your own proposal
                    says nothing: the whole value of the state is that somebody
                    else agreed to it. */}
                {m.status === 'proposed' && !mine && (
                  <Button disabled={busy} onClick={() => act(() => live.confirmMeeting(m.id))}>
                    Yes, that works
                  </Button>
                )}
                <Button variant="ghost" disabled={busy} onClick={() => act(() => live.cancelMeeting(m.id))}>
                  Cancel
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
