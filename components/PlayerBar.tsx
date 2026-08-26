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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AMBIENCE, playerCredit, usePlayer, type Track } from '@/lib/player';
import { usePlayerLists } from '@/lib/player-lists';
import { getBlob, humanSize, listMedia, type MediaMeta } from '@/lib/localMedia';
import { saveFilesFromInput, savedMessage } from '@/lib/save-media';

// Whether the rail's player is expanded. Per device, because it is a
// preference about this screen rather than anything about the account.
const STRIP_OPEN_KEY = 'beacon.player.rail-open';
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

/**
 * The vault: this device's own music and video, and the URLs to play them.
 *
 * Shared by both sizes of player so there is one list and one URL per file, not
 * one of each per component.
 *
 * BLOB URLS ARE MADE ON PRESS AND NEVER REVOKED, and that is deliberate rather
 * than an oversight. components/MediaPlayer revokes on unmount, which is right
 * there because the element it feeds dies with the component. This player
 * outlives the page — the provider sits in the root layout precisely so a track
 * keeps running while you walk between rooms — so revoking on unmount would cut
 * the sound off at the exact moment the design promises it will not. One URL
 * per file actually played, held for the session, is what that costs.
 */
function useVault(supplied?: MediaMeta[]) {
  const [loaded, setLoaded] = useState<MediaMeta[]>([]);
  const [opening, setOpening] = useState('');
  const made = useRef(new Map<string, string>());
  const [opened, setOpened] = useState<Track[]>([]);

  // A caller that already has the list (the Library page) hands it over; the
  // rail has no list of its own and reads the device directly.
  const external = supplied !== undefined;
  const refresh = useCallback(async () => {
    if (external) return;
    setLoaded(await listMedia());
  }, [external]);
  useEffect(() => {
    if (external) return;
    let alive = true;
    void listMedia().then((rows) => { if (alive) setLoaded(rows); });
    return () => { alive = false; };
  }, [external]);

  const all = supplied ?? loaded;
  // Only audio and video. A PDF in a queue is a track that silently ends the
  // run, because there is nothing for the player to do with it.
  const playable = useMemo(
    () => all.filter((m) => m.type === 'audio' || m.type === 'video'),
    [all],
  );

  const trackFor = (m: MediaMeta, url?: string): Track => ({
    id: m.id,
    title: m.title,
    url,
    icon: m.type === 'video' ? '🎬' : '🎵',
  });

  const open = async (m: MediaMeta, play: (t: Track, q?: Track[]) => void) => {
    let url = made.current.get(m.id);
    if (!url) {
      setOpening(m.id);
      try {
        const blob = await getBlob(m.id);
        if (!blob) return;
        url = URL.createObjectURL(blob);
        made.current.set(m.id, url);
      } finally {
        setOpening('');
      }
    }
    const track = trackFor(m, url);
    // The queue is everything opened so far this session, in the order the list
    // shows them, so "next" walks the vault instead of stopping dead.
    const queue = playable
      .filter((o) => o.id === m.id || made.current.has(o.id))
      .map((o) => (o.id === m.id ? track : trackFor(o, made.current.get(o.id))));
    setOpened(queue);
    play(track, queue);
  };

  return { playable, opening, open, opened, refresh };
}

/** The three tabs, in the order somebody actually wants them. */
type Tab = 'vault' | 'playlists' | 'ambience';

const TAB_LABEL: Record<Tab, string> = {
  vault: 'Vault',
  playlists: 'Playlists',
  ambience: 'Ambience',
};

/**
 * The small player, in the right rail of every room.
 *
 * WHY IT COLLAPSES. This is the player people see all day, on a rail that also
 * carries the room, the study timer and the theme picker. Open, it is the
 * tallest thing there; shut, it is four lines that say what is playing. Neither
 * is right for everybody all the time, so it is a choice, and the choice is
 * remembered on the device.
 *
 * Shut is the default. Somebody who has never touched the player should not
 * have to scroll past its whole library to reach the timer.
 */
export function PlayerStrip({ theme }: { theme: RoomTheme }) {
  const player = usePlayer();
  const lists = usePlayerLists();
  const vault = useVault();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('vault');
  const [find, setFind] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Read once on mount rather than during render: the server has no
  // localStorage, and reading it inline is how a hydration mismatch starts.
  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(STRIP_OPEN_KEY) === '1');
    } catch { /* private mode, or storage switched off. Shut is fine. */ }
  }, []);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    try { window.localStorage.setItem(STRIP_OPEN_KEY, next ? '1' : '0'); } catch { /* fine */ }
  };

  if (!player) return null;
  const { current, playing, volume, toggle, play, setVolume } = player;

  const needle = find.trim().toLowerCase();
  const found = needle
    ? vault.playable.filter((m) => m.title.toLowerCase().includes(needle))
    : vault.playable;

  const everything = [...AMBIENCE, ...vault.opened];
  const byId = new Map(everything.map((t) => [t.id, t]));
  const tracksOf = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBusy(true);
    const result = await saveFilesFromInput(e.target);
    setBusy(false);
    setNote(savedMessage(result));
    // Re-read the device, so a file just saved is playable without a reload.
    // Leaving this out is how the button appears to do nothing.
    if (result.saved > 0) {
      await vault.refresh();
      window.setTimeout(() => setNote(''), 2600);
    }
  };

  const rowStyle = (on: boolean) =>
    on ? { backgroundColor: theme.line } : undefined;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: theme.panel, border: `1px solid ${theme.line}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: theme.inkSoft }}
        >
          Player
        </p>
        <div className="flex items-center gap-2">
          <Credit />
          <button
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            aria-label={open ? 'Hide the player’s tracks' : 'Show the player’s tracks'}
            title={open ? 'Hide tracks' : 'Show tracks'}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-sm leading-none"
            style={{ color: theme.inkSoft }}
          >
            {open ? '⌄' : '⋯'}
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (current ? toggle() : player.play(AMBIENCE[0], AMBIENCE))}
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

      {open && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {(['vault', 'playlists', 'ambience'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className="rounded-xl px-2 py-2 text-xs font-bold"
                style={
                  tab === t
                    ? { backgroundColor: theme.accent, color: '#fff' }
                    : { backgroundColor: theme.line, color: theme.ink }
                }
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          {tab === 'vault' && (
            <div className="mt-2 space-y-2">
              <input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Search your media…"
                aria-label="Search your media"
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{
                  backgroundColor: '#fff',
                  color: '#1E2A4A',
                  border: `1px solid ${theme.line}`,
                }}
              />

              {vault.playable.length === 0 ? (
                <p className="text-xs" style={{ color: theme.inkSoft }}>
                  Your vault is empty. Save music or video below. It stays on
                  this device.
                </p>
              ) : found.length === 0 ? (
                <p className="text-xs" style={{ color: theme.inkSoft }}>
                  Nothing matches “{find.trim()}”.
                </p>
              ) : (
                <ul className="space-y-1">
                  {found.map((m) => {
                    const on = current?.id === m.id;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => void vault.open(m, play)}
                          className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left"
                          style={rowStyle(on)}
                        >
                          <span aria-hidden>{m.type === 'video' ? '🎬' : '🎵'}</span>
                          <span
                            className="min-w-0 flex-1 truncate text-xs font-semibold"
                            style={{ color: theme.ink }}
                          >
                            {m.title}
                          </span>
                          {vault.opening === m.id && (
                            <span className="text-[10px]" style={{ color: theme.inkSoft }}>
                              Opening…
                            </span>
                          )}
                          {on && playing && (
                            <span
                              className="text-[10px] font-bold"
                              style={{ color: theme.accent }}
                            >
                              Playing
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="audio/*,video/*"
                multiple
                onChange={onFiles}
                className="hidden"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: theme.accent }}
              >
                {busy ? 'Saving…' : '⬆ Save music or video'}
              </button>
              {note && (
                <p className="text-xs font-semibold" style={{ color: theme.ink }}>{note}</p>
              )}
              <p className="text-[11px] leading-snug" style={{ color: theme.inkSoft }}>
                Original quality is kept. Whether it plays at full resolution
                depends on the file, the browser and the screen.
              </p>
              <p className="text-[11px] leading-snug" style={{ color: theme.inkSoft }}>
                Your files stay on this device and are never uploaded.
              </p>
            </div>
          )}

          {tab === 'playlists' && (
            <div className="mt-2 space-y-1">
              {lists.lists.length === 0 && (
                <p className="text-xs" style={{ color: theme.inkSoft }}>
                  No playlists yet. Make one in My Library.
                </p>
              )}
              {lists.lists.map((list) => {
                const tracks = tracksOf(list.trackIds);
                return (
                  <button
                    key={list.id}
                    type="button"
                    disabled={tracks.length === 0}
                    onClick={() => play(tracks[0], tracks)}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left disabled:opacity-50"
                  >
                    <span aria-hidden>🎶</span>
                    <span
                      className="min-w-0 flex-1 truncate text-xs font-semibold"
                      style={{ color: theme.ink }}
                    >
                      {list.name}
                    </span>
                    <span className="text-[10px]" style={{ color: theme.inkSoft }}>
                      {tracks.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'ambience' && (
            <div className="mt-2 space-y-1">
              {AMBIENCE.map((track) => {
                const on = current?.id === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => play(track, AMBIENCE)}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left"
                    style={rowStyle(on)}
                  >
                    <span aria-hidden>{track.icon ?? '🎵'}</span>
                    <span
                      className="min-w-0 flex-1 truncate text-xs font-semibold"
                      style={{ color: theme.ink }}
                    >
                      {track.title}
                    </span>
                    {on && playing && (
                      <span className="text-[10px] font-bold" style={{ color: theme.accent }}>
                        Playing
                      </span>
                    )}
                  </button>
                );
              })}
              <p className="pt-1 text-[11px] leading-snug" style={{ color: theme.inkSoft }}>
                Made on your device as it plays. No download, no data, and it
                works with no signal.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}



/**
 * The full player, and the only place it is drawn.
 *
 * WHY THE VAULT COMES FIRST. The tabs used to open on Ambience, which is the
 * one thing on this panel nobody had to go and get. Somebody who has saved
 * eight files to their phone opened the player and was offered rainfall. Your
 * own files are the reason you came; generated hush is the fallback.
 *
 * BLOB URLS ARE MADE ON PRESS AND NEVER REVOKED, and that is deliberate rather
 * than an oversight. components/MediaPlayer revokes on unmount, which is right
 * there because the element it feeds dies with the component. This player
 * outlives the page — the provider is in the root layout precisely so a track
 * keeps running while you walk back to your room — so revoking on unmount would
 * cut the sound off at the exact moment the design promises it will not. One
 * URL per file actually played, held for the session, is the cost of that.
 */
export function PlayerPanel({
  vault = [],
  theme,
  onAddMedia,
}: {
  /** The person's own files, saved on this device. Empty everywhere but /library. */
  vault?: MediaMeta[];
  theme?: RoomTheme;
  /** Sends somebody with an empty vault to the upload control on the page. */
  onAddMedia?: () => void;
}) {
  const player = usePlayer();
  const lists = usePlayerLists();
  // Same hook the rail uses, so both sizes read one list and share one object
  // URL per file rather than making a second copy of every track.
  const shelf = useVault(vault);
  // ALWAYS OPENS ON THE VAULT, even when the vault is empty. Opening on
  // Ambience when there is nothing saved hides the existence of the vault from
  // exactly the person who has not used it yet; its empty state is the thing
  // that explains what it is and carries the button that fills it.
  const [tab, setTab] = useState<Tab>('vault');
  const [newName, setNewName] = useState('');
  const [openList, setOpenList] = useState('');
  const [find, setFind] = useState('');
  if (!player) return null;
  const { current, playing, volume, toggle, play, setVolume } = player;

  const accent = theme?.accent ?? '#1E2A4A';

  const playableVault = shelf.playable;
  const needle = find.trim().toLowerCase();
  const foundVault = needle
    ? playableVault.filter((m) => m.title.toLowerCase().includes(needle))
    : playableVault;

  // Everything the player can reach, so a playlist can hold ambience and your
  // own recordings side by side. Somebody wanting rainfall behind a sermon
  // should not need two players to do it.
  const everything = [...AMBIENCE, ...shelf.opened];
  const byId = new Map(everything.map((t) => [t.id, t]));
  const tracksOf = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((t): t is Track => Boolean(t));

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-xl font-bold text-navy">🎧 Beacon media player</h2>
        <Credit className="text-navy" />
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Your own music and video, played here in full size, or something quiet
        in the background while you read. Files stay on this device.
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
        <button
          type="button"
          onClick={() => (current ? toggle() : play(AMBIENCE[0], AMBIENCE))}
          aria-label={playing ? 'Pause' : 'Play'}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-xl text-white"
          style={{ backgroundColor: accent }}
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
              className="h-1 w-full max-w-xs cursor-pointer"
              style={{ accentColor: accent }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {(['vault', 'playlists', 'ambience'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`tap-sm rounded-xl px-3 py-2 text-sm font-bold ${
              tab === t ? 'text-white' : 'bg-gray-100 text-navy hover:bg-gray-200'
            }`}
            style={tab === t ? { backgroundColor: accent } : undefined}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* YOUR OWN FILES. Searchable because a vault worth having is a vault too
          long to scroll, and the name you remember is the fastest way in. */}
      {tab === 'vault' && (
        <div className="mt-3 space-y-2">
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Search your media…"
            aria-label="Search your media"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />

          {playableVault.length === 0 ? (
            <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
              <p>Your vault is empty. Save music or video below and it plays here.</p>
              <p className="mt-1">Your files stay on this device and are never uploaded.</p>
              {onAddMedia && (
                <button
                  type="button"
                  onClick={onAddMedia}
                  className="tap mt-2 inline-flex items-center justify-center gap-2 rounded-xl px-5 text-lg font-semibold text-white"
                  style={{ backgroundColor: accent }}
                >
                  ⬆ Save music or video
                </button>
              )}
            </div>
          ) : foundVault.length === 0 ? (
            <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
              Nothing in your vault matches “{find.trim()}”.
            </p>
          ) : (
            <div className="space-y-1.5">
              {foundVault.map((m) => {
                const on = current?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => void shelf.open(m, play)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                      on ? 'bg-gray-100' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span aria-hidden className="text-lg">{m.type === 'video' ? '🎬' : '🎵'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-navy">
                        {m.title}
                      </span>
                      <span className="block text-xs text-gray-500">{humanSize(m.size)}</span>
                    </span>
                    {shelf.opening === m.id && <span className="text-xs text-gray-500">Opening…</span>}
                    {on && playing && (
                      <span className="text-xs font-bold" style={{ color: accent }}>Playing</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

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
                        {/* A saved playlist can name a file that has not been
                            opened yet this session, so it has no URL to play.
                            Saying that beats an empty list that looks broken. */}
                        Nothing in here yet, or its tracks have not been opened
                        from the Vault yet this session.
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

      {tab === 'ambience' && (
        <div className="mt-3 space-y-1.5">
          {AMBIENCE.map((track) => {
            const on = current?.id === track.id;
            return (
              <button
                key={track.id}
                type="button"
                onClick={() => play(track, AMBIENCE)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                  on ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <span aria-hidden className="text-lg">{track.icon ?? '🎵'}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">
                  {track.title}
                </span>
                {on && playing && (
                  <span className="text-xs font-bold" style={{ color: accent }}>Playing</span>
                )}
              </button>
            );
          })}
          {/* AMBIENCE IS GENERATED, and saying so is worth a line: somebody on a
              phone plan needs to know this costs them nothing and works with no
              signal. */}
          <p className="pt-1 text-xs text-gray-500">
            Made on your device as it plays. No download, no data, and it works
            with no signal.
          </p>
        </div>
      )}

      {/* ADD TO PLAYLIST, where the tracks are. A select rather than a menu: it
          is one tap on a phone and needs no dismiss logic. Drawn only when a
          playlist exists, so it never offers an empty list. */}
      {tab !== 'playlists' && lists.lists.length > 0 && current && (
        <label className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 p-2.5 text-sm">
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
    </Card>
  );
}
