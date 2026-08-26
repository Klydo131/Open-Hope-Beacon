'use client';

// The player, in two sizes.
//
// `PlayerStrip` is the right-rail version: art, title, play, volume. It is the
// one people see all day, so it is deliberately small and says only what is
// playing.
//
// `PlayerPanel` is the library version: the same player with the things you
// choose from underneath it, in tabs.
//
// BOTH DRIVE THE SAME AUDIO. See lib/player.tsx: the element lives above both,
// so pressing play in the rail and then opening the library does not start a
// second copy, and leaving the library does not cut the sound off.

import { useState } from 'react';
import { AMBIENCE, playerCredit, usePlayer, type Track } from '@/lib/player';
import { usePlayerLists } from '@/lib/player-lists';
import { Button, Card } from '@/components/ui';
import type { RoomTheme } from '@/lib/room-theme';

function Credit({ className = '' }: { className?: string }) {
  const credit = playerCredit();
  // Nothing is printed when the deployment names nobody. A fork sees no
  // credit rather than somebody else's product name.
  if (!credit) return null;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider opacity-60 ${className}`}>
      {credit}
    </span>
  );
}

export function PlayerStrip({ theme }: { theme: RoomTheme }) {
  const player = usePlayer();
  if (!player) return null;
  const { current, playing, volume, toggle, setVolume } = player;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: theme.panel, border: `1px solid ${theme.line}` }}
    >
      <div className="flex items-center justify-between">
        <p
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: theme.inkSoft }}
        >
          Player
        </p>
        <Credit />
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (current ? toggle() : player.play(AMBIENCE[0]))}
          aria-label={playing ? 'Pause' : 'Play'}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg text-white"
          style={{ backgroundColor: theme.accent }}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold" style={{ color: theme.ink }}>
            {current ? `${current.icon ?? ''} ${current.title}`.trim() : 'Nothing playing'}
          </p>
          <p className="text-xs" style={{ color: theme.inkSoft }}>
            {current ? (playing ? 'Playing' : 'Paused') : 'Pick something below'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span aria-hidden style={{ color: theme.inkSoft }}>🔈</span>
        <input
          type="range" min={0} max={1} step={0.01} value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="h-1 w-full cursor-pointer"
          style={{ accentColor: theme.accent }}
        />
      </div>
    </div>
  );
}

type Tab = 'ambience' | 'playlists' | 'library';

export function PlayerPanel({ libraryTracks = [] }: { libraryTracks?: Track[] }) {
  const player = usePlayer();
  const lists = usePlayerLists();
  const [tab, setTab] = useState<Tab>('ambience');
  const [newName, setNewName] = useState('');
  const [openList, setOpenList] = useState('');
  if (!player) return null;
  const { current, playing, volume, toggle, play, setVolume } = player;

  // Everything the player can reach, so a playlist can hold ambience and
  // library audio side by side. Somebody wanting rainfall behind a sermon
  // recording should not need two players to do it.
  const everything = [...AMBIENCE, ...libraryTracks];
  const byId = new Map(everything.map((t) => [t.id, t]));
  const tracksOf = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));

  const shown = tab === 'ambience' ? AMBIENCE : tab === 'library' ? libraryTracks : [];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-xl font-bold text-navy">🎧 Beacon media player</h2>
        <Credit className="text-navy" />
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Something quiet in the background while you read, or anything your
        church has put in the library.
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
        <button
          type="button"
          onClick={() => (current ? toggle() : play(AMBIENCE[0], AMBIENCE))}
          aria-label={playing ? 'Pause' : 'Play'}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-navy text-xl text-white"
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-navy">
            {current ? `${current.icon ?? ''} ${current.title}`.trim() : 'Nothing playing'}
          </p>
          <p className="text-sm text-gray-500">{current ? (playing ? 'Playing' : 'Paused') : 'Choose a track'}</p>
          <div className="mt-2 flex items-center gap-2">
            <span aria-hidden className="text-gray-400">🔈</span>
            <input
              type="range" min={0} max={1} step={0.01} value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              className="h-1 w-full max-w-xs cursor-pointer accent-navy"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {(['ambience', 'playlists', 'library'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`tap-sm rounded-xl px-3 py-2 text-sm font-bold ${
              tab === t ? 'bg-navy text-white' : 'bg-gray-100 text-navy hover:bg-gray-200'
            }`}
          >
            {t === 'ambience' ? 'Ambience' : t === 'playlists' ? 'Playlists' : 'Library'}
          </button>
        ))}
      </div>

      {/* PLAYLISTS. Kept on this device, never uploaded: what somebody listens
          to while they read is nobody else's business, and a church database is
          a place other people can see. */}
      {tab === 'playlists' && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name a playlist, for example Sabbath study"
              className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
            <Button
              variant="ghost"
              disabled={!newName.trim()}
              onClick={() => {
                // Seeded with whatever is playing, because the moment somebody
                // wants a playlist is usually while listening to something.
                lists.create(newName, current ? [current.id] : []);
                setNewName('');
              }}
            >
              Create
            </Button>
          </div>

          {lists.lists.length === 0 && (
            <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
              No playlists yet. Name one above, then use <strong>Add to playlist</strong>
              {' '}on any track.
            </p>
          )}

          {lists.lists.map((list) => {
            const tracks = tracksOf(list.trackIds);
            const open = openList === list.id;
            return (
              <div key={list.id} className="rounded-xl bg-gray-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenList(open ? '' : list.id)}
                    className="flex-1 text-left font-semibold text-navy underline underline-offset-2"
                  >
                    {list.name}
                  </button>
                  <span className="text-xs text-gray-500">
                    {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
                  </span>
                  <Button
                    disabled={tracks.length === 0}
                    onClick={() => play(tracks[0], tracks)}
                  >
                    Play
                  </Button>
                  <button
                    type="button"
                    onClick={() => lists.remove(list.id)}
                    className="text-xs text-gray-400 underline"
                  >
                    Delete
                  </button>
                </div>
                {open && (
                  <ul className="mt-2 space-y-1">
                    {tracks.length === 0 && (
                      <li className="text-sm text-gray-500">
                        Nothing in here yet.
                      </li>
                    )}
                    {tracks.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-sm">
                        <button
                          type="button"
                          onClick={() => play(t, tracks)}
                          className="min-w-0 flex-1 truncate text-left font-semibold text-navy"
                        >
                          {t.icon ?? '🎵'} {t.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => lists.removeFrom(list.id, t.id)}
                          className="text-xs text-gray-400 underline"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {shown.length === 0 && (
          <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
            Nothing here yet. Anything your church adds to the library as audio
            appears in this list.
          </p>
        )}
        {shown.map((track) => {
          const on = current?.id === track.id;
          return (
            <button
              key={track.id}
              type="button"
              onClick={() => play(track, shown)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                on ? 'bg-navy/10' : 'hover:bg-gray-50'
              }`}
            >
              <span aria-hidden className="text-lg">{track.icon ?? '🎵'}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">
                {track.title}
              </span>
              {on && playing && <span className="text-xs font-bold text-navy">Playing</span>}
            </button>
          );
        })}

        {/* ADD TO PLAYLIST, where the tracks are. A select rather than a menu:
            it is one tap on a phone and needs no dismiss logic. Drawn only when
            a playlist exists, so it never offers an empty list. */}
        {shown.length > 0 && lists.lists.length > 0 && current && (
          <label className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 p-2.5 text-sm">
            <span className="font-semibold text-navy">Add what is playing to</span>
            <select
              value=""
              onChange={(e) => { if (e.target.value) lists.addTo(e.target.value, current.id); }}
              className="rounded-xl border border-gray-300 px-2 py-1"
            >
              <option value="">Choose a playlist…</option>
              {lists.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* AMBIENCE IS GENERATED, and saying so is worth a line: somebody on a
          phone plan needs to know this costs them nothing and works with no
          signal. */}
      {tab === 'ambience' && (
        <p className="mt-3 text-xs text-gray-500">
          Made on your device as it plays. No download, no data, and it works
          with no signal.
        </p>
      )}
    </Card>
  );
}
