'use client';

import { useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { Card, Button } from '@/components/ui';
import type { Meeting } from '@/lib/types';

// Shared scheduling card for a pairing — used by both the missionary and the
// seeker. Schedule a call or an in-person study time, see what's coming up
// (with a "Soon" flag for the next 24h), and cancel. Both sides are notified.
// A Google Maps link for a place somebody typed.
//
// Deliberately a link, not an embedded map. An embed needs a Google Maps API
// key, which means a billing account, a key in the hosting environment and a
// key that leaks the moment it reaches the browser — a lot of moving parts for a
// church, to show a picture of a place they already know. A link opens the map
// app the person already has, already signed in, with their own saved places and
// their own directions.
//
// `encodeURIComponent` is doing real work here: the location is free text typed
// by a missionary, and it goes into a URL. Anything that is only whitespace
// yields no link at all rather than a map of nowhere.
function mapsUrl(place: string | undefined): string | null {
  const q = (place || '').trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function Meetings({ pairingId }: { pairingId: string }) {
  const { db, scheduleMeeting, cancelMeeting } = useDemo();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [mode, setMode] = useState<Meeting['mode']>('online');
  const [location, setLocation] = useState('');

  const upcoming = db.meetings
    .filter(
      (m) =>
        m.pairing_id === pairingId &&
        m.status === 'scheduled' &&
        new Date(m.when).getTime() > Date.now() - 60 * 60 * 1000,
    )
    .sort((a, b) => a.when.localeCompare(b.when));

  const schedule = () => {
    if (!when) return;
    scheduleMeeting(pairingId, {
      title,
      when: new Date(when).toISOString(),
      mode,
      location: mode === 'in_person' ? location : undefined,
    });
    setTitle('');
    setWhen('');
    setLocation('');
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">📅 Meetings</h2>
      <p className="mb-4 text-sm text-gray-500">
        Book a call or an in-person study time. You’ll both be notified.
      </p>

      <div className="grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What’s it about?"
          className="tap w-full min-w-0 rounded-xl bg-white px-4 text-lg outline-none ring-1 ring-black/5 focus:ring-2 focus:ring-gold sm:col-span-2"
        />
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="tap w-full min-w-0 rounded-xl bg-white px-3 text-base ring-1 ring-black/5"
          aria-label="Date and time"
        />
        {/* TWO BUTTONS, NOT A DROPDOWN, matching the live screen. The select
            defaulted to Online and said so whether or not anybody had looked at
            it, so the place field, which exists only for the other choice, was
            never reached: "I still dont see the location with the meetings".
            Two buttons show both choices at once. */}
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Online or in person">
          {([['online', '💻 Online call'], ['in_person', '📍 In person']] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`tap-sm rounded-xl px-3 py-2.5 text-sm font-bold ${
                mode === m ? 'bg-navy text-white' : 'bg-gray-100 text-navy hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'in_person' && (
          <div className="sm:col-span-2">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Church cafe, 12 Rizal St, Cavite"
              aria-label="Where you are meeting"
              className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-black/5"
            />
            <p className="mt-1 text-xs text-gray-500">
              A place and a street. It becomes an Open in Maps button for both
              of you.
            </p>
          </div>
        )}
        <div className="sm:col-span-2">
          {/* An in-person meeting with no place is a time and nothing else. */}
          <Button
            variant="gold"
            disabled={!when || (mode === 'in_person' && !location.trim())}
            onClick={schedule}
          >
            Schedule
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {upcoming.length === 0 ? (
          <p className="text-gray-400">No meetings scheduled yet.</p>
        ) : (
          upcoming.map((m) => {
            const d = new Date(m.when);
            const soon = d.getTime() - Date.now() < 24 * 60 * 60 * 1000;
            return (
              <div
                key={m.id}
                className="flex items-start gap-3 rounded-xl bg-gray-50 px-4 py-3"
              >
                <span className="text-2xl" aria-hidden>
                  {m.mode === 'in_person' ? '📍' : '📞'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate font-semibold text-navy">
                      {m.title}
                    </p>
                    {soon && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                        Soon
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {d.toLocaleString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {m.mode === 'in_person' && m.location
                      ? ` · ${m.location}`
                      : ' · Online'}
                  </p>
                  {m.mode === 'in_person' && mapsUrl(m.location) && (
                    <a
                      href={mapsUrl(m.location)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-navy ring-1 ring-black/5 hover:bg-gray-100"
                    >
                      <span aria-hidden>🗺️</span> Open in Maps
                    </a>
                  )}
                </div>
                <button
                  onClick={() => cancelMeeting(m.id)}
                  className="shrink-0 self-start text-sm font-semibold text-gray-400 underline"
                >
                  Cancel
                </button>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
