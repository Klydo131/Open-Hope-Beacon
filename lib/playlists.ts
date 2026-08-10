'use client';

import { useCallback, useEffect, useState } from 'react';

// Playlists for the Orbit player.
//
// A playlist is only a name and an ordered list of media ids, so it lives in
// localStorage while the media itself stays in IndexedDB (lib/localMedia). That
// split matters: the heavy blobs are stored once and referenced many times, so
// putting a track in five playlists costs five short strings, not five copies of
// the file. Everything is on the device — nothing here is uploaded anywhere.

const KEY = 'beacon-playlists-v1';

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  created_at: string;
}

const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function load(): Playlist[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(next: Playlist[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A full disk must not break playback of what is already loaded.
  }
}

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPlaylists(load());
    setReady(true);
  }, []);

  const commit = useCallback((next: Playlist[]) => {
    setPlaylists(next);
    save(next);
  }, []);

  const create = useCallback(
    (name: string) => {
      const pl: Playlist = {
        id: uid(),
        name: name.trim() || 'New playlist',
        trackIds: [],
        created_at: new Date().toISOString(),
      };
      commit([...load(), pl]);
      return pl.id;
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => commit(load().filter((p) => p.id !== id)),
    [commit],
  );

  const rename = useCallback(
    (id: string, name: string) =>
      commit(
        load().map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)),
      ),
    [commit],
  );

  // Adding a track twice is a no-op rather than a duplicate row — the same song
  // appearing twice in one playlist is never what someone meant.
  const addTrack = useCallback(
    (playlistId: string, trackId: string) =>
      commit(
        load().map((p) =>
          p.id === playlistId && !p.trackIds.includes(trackId)
            ? { ...p, trackIds: [...p.trackIds, trackId] }
            : p,
        ),
      ),
    [commit],
  );

  const removeTrack = useCallback(
    (playlistId: string, trackId: string) =>
      commit(
        load().map((p) =>
          p.id === playlistId
            ? { ...p, trackIds: p.trackIds.filter((t) => t !== trackId) }
            : p,
        ),
      ),
    [commit],
  );

  // When a file is deleted from the vault its id must not linger in playlists,
  // or they fill up with entries that cannot play.
  const forgetTrack = useCallback(
    (trackId: string) =>
      commit(
        load().map((p) => ({
          ...p,
          trackIds: p.trackIds.filter((t) => t !== trackId),
        })),
      ),
    [commit],
  );

  return {
    playlists,
    ready,
    create,
    remove,
    rename,
    addTrack,
    removeTrack,
    forgetTrack,
  };
}
