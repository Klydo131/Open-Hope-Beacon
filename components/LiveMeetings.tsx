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
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          aria-label="When"
          className="rounded-xl border border-gray-300 px-3 py-2"
        />

        {/* TWO BUTTONS, NOT A DROPDOWN, and that is the whole reason the
            location field went unnoticed. A <select> defaulted to Online and
            said "Online (call)" whether or not anybody had looked at it, so the
            place field, which only exists for the other choice, was never
            reached. Two buttons show both choices at once, and pressing one is
            one tap rather than open-scroll-choose. */}
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Online or in person">
          {([['online', '💻 Online call'], ['in_person', '📍 In person']] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`tap-sm rounded-xl px-3 py-2.5 text-sm font-bold ${
                mode === m
                  ? 'bg-navy text-white'
                  : 'bg-gray-100 text-navy hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* AN IN-PERSON MEETING WITHOUT A PLACE IS NOT A MEETING.
            This used to be optional, so it was possible to propose meeting
            somebody in person and send them a time and no location. The other
            person then has to ask where, which is the one thing arranging it on
            a shared card was supposed to save them. The Propose button stays
            disabled until this is filled in.

            The example is a real address shape on purpose: "Church hall" alone
            maps to every church hall in the country. */}
        {mode === 'in_person' && (
          <div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Church cafe, 12 Rizal St, Cavite"
              aria-label="Where you are meeting"
              className="w-full rounded-xl border border-gray-300 px-3 py-2"
            />
            <p className="mt-1 text-xs text-gray-500">
              A place and a street. It becomes an Open in Maps button for both
              of you.
            </p>
          </div>
        )}
        <div>
          <Button
            variant="gold"
            disabled={busy || !startsAt || (mode === 'in_person' && !location.trim())}
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

      {/* ONE ROW PER MEETING, in the same shape as My lessons and Shared with
          you: what it is on the left, the one thing to do on the right. The
          previous version stacked four separate controls under every meeting
          and read as a form rather than a list. */}
      <div className="mt-4 space-y-2">
        {rows !== null && upcoming.length === 0 && (
          <p className="text-sm text-gray-400">Nothing arranged yet.</p>
        )}
        {upcoming.map((m) => {
          const map = mapsUrl(m.location);
          const mine = m.created_by === me;
          return (
            <div key={m.id} className="rounded-xl bg-gray-50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-navy">{m.title || 'A time together'}</p>
                    {soon(m.starts_at) && (
                      <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-navy">
                        Soon
                      </span>
                    )}
                    {m.status === 'proposed' && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                        Waiting
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
                  </p>
                  {/* THE PLACE ON ITS OWN LINE. Run into the date it was a tail
                      on a sentence nobody finished reading, which is half of
                      why the location looked like it was not there. */}
                  {m.mode === 'in_person' && m.location && (
                    <p className="mt-0.5 truncate text-sm font-semibold text-navy">
                      📍 {m.location}
                    </p>
                  )}
                </div>

                {/* ONE BUTTON ON THE RIGHT, and which one depends on what this
                    person can actually do. ONLY THE OTHER PERSON CONFIRMS:
                    confirming your own proposal says nothing, because the whole
                    value of the state is that somebody else agreed to it. */}
                {m.status === 'proposed' && !mine ? (
                  <Button disabled={busy} onClick={() => act(() => live.confirmMeeting(m.id))}>
                    Yes, that works
                  </Button>
                ) : map ? (
                  <a
                    href={map}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tap-sm shrink-0 rounded-xl bg-white px-4 text-sm font-semibold text-navy ring-1 ring-black/10"
                  >
                    Open in Maps
                  </a>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                {/* Kept as a quiet link rather than a second big button. Both
                    of these matter far less often than confirming or finding
                    the place, and two heavy buttons per row is what made the
                    list read as a form. */}
                {m.status === 'proposed' && !mine && map && (
                  <a
                    href={map}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-navy underline underline-offset-2"
                  >
                    Open in Maps
                  </a>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(() => live.cancelMeeting(m.id))}
                  className="text-sm text-gray-500 underline underline-offset-2 disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
