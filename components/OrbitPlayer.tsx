'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoomTheme } from '@/lib/room-theme';
import {
  listMedia,
  getBlob,
  putMedia,
  deleteMedia,
  typeFromMime,
  humanSize,
  inspectPlayableMedia,
  prepareMediaStorage,
  resolutionLabel,
  LocalMediaError,
  newMediaId,
  type MediaMeta,
} from '@/lib/localMedia';
import { usePlaylists } from '@/lib/playlists';
import { shareItem, blobToFile, canShareFiles } from '@/lib/share';

// -------------------------------------------------------------------------
// Orbit — the mini player that sits in the corner of your room.
//
// Three shelves:
//
//   Vault      — the person's own music and video, saved on THIS device in
//                IndexedDB. Upload, search, play, delete. Nothing is uploaded to
//                any server; the app never sees the bytes leave the machine.
//   Playlists  — names and ordered lists of track ids, kept in localStorage.
//                A track in five playlists costs five short strings, not five
//                copies of the file, because the blob is stored once in the
//                vault and referenced.
//   Ambience   — rain, wind, waves, a quiet room, chimes, all SYNTHESISED in the
//                browser with the Web Audio API. No files, no download, no
//                streaming. That is a cost decision: one 3-minute track would be
//                a bigger download than the whole of Beacon, and hosting a
//                library of them would leave the free tier on day one. Shaped
//                noise costs zero bytes and works with no signal.
//
// Deleting a track removes the blob AND its id from every playlist — otherwise
// playlists slowly fill with entries that cannot play.
// -------------------------------------------------------------------------

type StationKey = 'rain' | 'wind' | 'ocean' | 'room' | 'chimes';

const STATIONS: { key: StationKey; label: string; icon: string }[] = [
  { key: 'rain', label: 'Rain', icon: '🌧️' },
  { key: 'wind', label: 'Wind', icon: '🍃' },
  { key: 'ocean', label: 'Waves', icon: '🌊' },
  { key: 'room', label: 'Quiet Room', icon: '🕯️' },
  { key: 'chimes', label: 'Chimes', icon: '🔔' },
];

// One reusable buffer of pink-ish noise. Pink (rather than white) noise is the
// one that reads as "natural" — white noise sounds like a broken television.
function makeNoise(ctx: AudioContext): AudioBuffer {
  const secs = 4;
  const len = ctx.sampleRate * secs;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const out = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buf;
}

interface Voice {
  stop: () => void;
}

// Each station is a small graph: looping noise -> filter(s) -> gain -> out.
// The slow LFOs are what stop it sounding like a fan; they give the sound a
// tide, which is the difference between "ambience" and "hiss".
function startStation(
  ctx: AudioContext,
  dest: GainNode,
  buf: AudioBuffer,
  station: StationKey,
): Voice {
  const stops: (() => void)[] = [];

  const noiseThrough = (
    type: BiquadFilterType,
    freq: number,
    q: number,
    gain: number,
  ) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filt).connect(g).connect(dest);
    src.start();
    stops.push(() => {
      try { src.stop(); } catch {}
      src.disconnect();
      filt.disconnect();
      g.disconnect();
    });
    return { filt, g };
  };

  // A slow sine that sways a parameter around a centre value.
  const sway = (
    param: AudioParam,
    centre: number,
    depth: number,
    rateHz: number,
  ) => {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rateHz;
    const amp = ctx.createGain();
    amp.gain.value = depth;
    param.value = centre;
    lfo.connect(amp).connect(param);
    lfo.start();
    stops.push(() => {
      try { lfo.stop(); } catch {}
      lfo.disconnect();
      amp.disconnect();
    });
  };

  if (station === 'rain') {
    const { g } = noiseThrough('highpass', 900, 0.7, 0.55);
    const { filt: body } = noiseThrough('bandpass', 2400, 0.6, 0.25);
    sway(body.frequency, 2400, 500, 0.07);
    sway(g.gain, 0.5, 0.08, 0.11);
  } else if (station === 'wind') {
    const { filt, g } = noiseThrough('bandpass', 420, 1.4, 0.5);
    sway(filt.frequency, 420, 260, 0.05);
    sway(g.gain, 0.45, 0.22, 0.03);
  } else if (station === 'ocean') {
    const { filt, g } = noiseThrough('lowpass', 700, 0.9, 0.5);
    sway(filt.frequency, 700, 380, 0.055);
    // The long swell — roughly one wave every nine seconds.
    sway(g.gain, 0.42, 0.34, 0.11);
  } else if (station === 'room') {
    // Near-silence with a warm floor: the sound of a room that is not empty.
    noiseThrough('lowpass', 260, 0.7, 0.28);
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 96;
    const dg = ctx.createGain();
    dg.gain.value = 0.035;
    drone.connect(dg).connect(dest);
    drone.start();
    sway(dg.gain, 0.035, 0.018, 0.04);
    stops.push(() => {
      try { drone.stop(); } catch {}
      drone.disconnect();
      dg.disconnect();
    });
  } else {
    // Chimes: a quiet room, plus a bell every so often on a pentatonic scale
    // so any two notes that land together are still consonant.
    noiseThrough('lowpass', 240, 0.7, 0.2);
    const scale = [261.63, 293.66, 349.23, 392.0, 440.0, 523.25];
    let timer: ReturnType<typeof setTimeout>;
    const ring = () => {
      const f = scale[Math.floor(Math.random() * scale.length)];
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.13, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 4.6);
      osc.onended = () => { osc.disconnect(); g.disconnect(); };
      timer = setTimeout(ring, 2500 + Math.random() * 5000);
    };
    timer = setTimeout(ring, 600);
    stops.push(() => clearTimeout(timer));
  }

  return { stop: () => stops.forEach((s) => s()) };
}

// `variant` decides how much room the player gets, not what it can do.
//
// The rail version is a corner widget, and a corner is a bad place to watch
// anything: a video there is a postage stamp beside a page of other content. The
// full version is the same player given a page to live on, which is where video
// belongs. Both share this component so a feature added to one can never be
// missing from the other.
export function OrbitPlayer({
  theme,
  variant = 'rail',
}: {
  theme: RoomTheme;
  variant?: 'rail' | 'full';
}) {
  const full = variant === 'full';
  const [playing, setPlaying] = useState(false);
  const [station, setStation] = useState<StationKey>('rain');
  const [volume, setVolume] = useState(0.5);
  const [fileName, setFileName] = useState('');
  const [open, setOpen] = useState(variant === 'full');
  // The on-device library, which is the offline playlist. Loaded lazily the
  // first time the panel is opened — the rail renders on every page and there
  // is no reason to touch IndexedDB until someone asks for their music.
  const [tracks, setTracks] = useState<MediaMeta[] | null>(null);
  const [trackIx, setTrackIx] = useState(-1);
  // Which shelf the expanded panel is showing, and the search that filters it.
  const [view, setView] = useState<'vault' | 'lists' | 'ambience'>('vault');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  // The playlist being played, so prev/next walk IT rather than the whole vault.
  const [activeList, setActiveList] = useState<string | null>(null);
  const [openList, setOpenList] = useState<string | null>(null);
  const [newList, setNewList] = useState('');
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const pl = usePlaylists();

  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const voiceRef = useRef<Voice | null>(null);
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  // Whether what is loaded actually HAS a picture. Read from the decoded
  // stream (videoWidth) rather than the file's declared type, because a
  // mislabelled mime is common and the stream cannot lie.
  const [hasPicture, setHasPicture] = useState(false);
  const [resolution, setResolution] = useState('');
  const [mediaError, setMediaError] = useState('');
  const urlRef = useRef<string>('');

  const stopVoice = useCallback(() => {
    setHasPicture(false);
    voiceRef.current?.stop();
    voiceRef.current = null;
  }, []);

  // Tear everything down when the player leaves the page, and release the
  // object URL for a locally-opened file so the browser can free it.
  useEffect(() => {
    return () => {
      stopVoice();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      ctxRef.current?.close().catch(() => {});
    };
  }, [stopVoice]);

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
    if (mediaRef.current) mediaRef.current.volume = volume;
  }, [volume]);

  const toggle = useCallback(async () => {
    // A local file takes over the player when one is loaded.
    if (fileName && mediaRef.current) {
      if (playing) {
        mediaRef.current.pause();
        setPlaying(false);
      } else {
        try {
          await mediaRef.current.play();
          setPlaying(true);
        } catch {}
      }
      return;
    }

    if (playing) {
      stopVoice();
      setPlaying(false);
      return;
    }

    // The AudioContext is created on this click, never before — browsers
    // refuse to start audio without a gesture, and creating it early leaves a
    // suspended context sitting around on every page.
    try {
      if (!ctxRef.current) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctor();
        const g = ctx.createGain();
        g.gain.value = volume;
        g.connect(ctx.destination);
        ctxRef.current = ctx;
        gainRef.current = g;
        bufRef.current = makeNoise(ctx);
      }
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      stopVoice();
      voiceRef.current = startStation(ctx, gainRef.current!, bufRef.current!, station);
      setPlaying(true);
    } catch {
      /* audio is a comfort, never a requirement — fail quietly */
    }
  }, [playing, station, volume, fileName, stopVoice]);

  // Changing station while playing swaps the graph without a gap.
  const pick = useCallback(
    (key: StationKey) => {
      setStation(key);
      if (fileName) return;
      if (playing && ctxRef.current && gainRef.current && bufRef.current) {
        stopVoice();
        voiceRef.current = startStation(
          ctxRef.current,
          gainRef.current,
          bufRef.current,
          key,
        );
      }
    },
    [playing, fileName, stopVoice],
  );

  const clearFile = () => {
    mediaRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = '';
    setFileName('');
    setTrackIx(-1);
    setPlaying(false);
    setResolution('');
    setMediaError('');
  };

  // Load the on-device vault the first time the panel opens.
  const refresh = useCallback(async () => {
    try {
      const all = await listMedia();
      setTracks(all.filter((m) => m.type === 'audio' || m.type === 'video'));
    } catch {
      setTracks([]);
    }
  }, []);

  useEffect(() => {
    if (!open || tracks !== null) return;
    void refresh();
  }, [open, tracks, refresh]);

  const flash = useCallback((m: string) => {
    setNote(m);
    setTimeout(() => setNote(''), 2400);
  }, []);

  const vault = tracks ?? [];

  // What the person is looking at: the whole vault, or one playlist's tracks in
  // the order they arranged them.
  const shelf = useMemo(() => {
    const inList = openList
      ? (pl.playlists.find((p) => p.id === openList)?.trackIds ?? [])
          .map((id) => vault.find((t) => t.id === id))
          .filter((t): t is MediaMeta => !!t)
      : vault;
    const q = query.trim().toLowerCase();
    return q ? inList.filter((t) => t.title.toLowerCase().includes(q)) : inList;
  }, [vault, openList, pl.playlists, query]);

  // The queue prev/next walks. Playing from a playlist should stay inside it.
  const queue = useMemo(() => {
    if (!activeList) return vault;
    const ids = pl.playlists.find((p) => p.id === activeList)?.trackIds ?? [];
    return ids
      .map((id) => vault.find((t) => t.id === id))
      .filter((t): t is MediaMeta => !!t);
  }, [activeList, pl.playlists, vault]);

  // Save music or video into the vault. It stays on this device — IndexedDB —
  // and is never uploaded anywhere.
  const upload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      if (!files.length) return;
      setBusy(true);
      try {
        await prepareMediaStorage(files.reduce((sum, file) => sum + file.size, 0));
        const ready: Array<{
          file: File;
          type: 'audio' | 'video';
          info: Pick<MediaMeta, 'width' | 'height' | 'duration'>;
        }> = [];
        for (const file of files) {
          const type = typeFromMime(file.type);
          if (type !== 'audio' && type !== 'video') {
            throw new LocalMediaError(
              'Choose an audio or video file that this device can play.',
            );
          }
          ready.push({ file, type, info: await inspectPlayableMedia(file, type) });
        }
        for (const { file, type, info } of ready) {
          await putMedia(
            {
              id: newMediaId(),
              title: file.name.replace(/\.[^.]+$/, ''),
              type,
              mime: file.type,
              size: file.size,
              created_at: new Date().toISOString(),
              ...info,
            },
            file,
          );
        }
        await refresh();
        flash(files.length === 1 ? 'Saved to your vault' : `${files.length} saved`);
      } catch (error) {
        flash(
          error instanceof LocalMediaError
            ? error.message
            : 'Could not save. This device may be out of space.',
        );
      } finally {
        setBusy(false);
      }
    },
    [refresh, flash],
  );

  // Remove a track for good: the blob, and every playlist that referenced it —
  // otherwise playlists fill with entries that cannot play.
  // Send a track out to Messenger, WhatsApp, or anywhere else on the device.
  //
  // The FILE is shared, not a link, and that is not a shortcut: media uploaded
  // here is stored on this device only, so no address for it exists to send.
  // Where the browser cannot share files (most desktops) the honest answer is a
  // download the person can attach themselves, not a silent failure.
  const shareTrack = useCallback(async (m: MediaMeta) => {
    try {
      const blob = await getBlob(m.id);
      if (!blob) { flash('That file is no longer on this device.'); return; }
      const file = blobToFile(blob, m.title, m.mime);
      if (canShareFiles(file)) {
        const res = await shareItem({ title: m.title, text: m.note, file });
        if (res === 'shared' || res === 'cancelled') return;
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = m.title;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 10000);
      flash('Saved. Attach it wherever you want to send it.');
    } catch {
      flash('Could not share that file.');
    }
  }, [flash]);

  const removeTrack = useCallback(
    async (m: MediaMeta) => {
      if (!window.confirm(`Delete "${m.title}" from this device?`)) return;
      if (queue[trackIx]?.id === m.id) {
        mediaRef.current?.pause();
        setPlaying(false);
        setTrackIx(-1);
        setFileName('');
      }
      await deleteMedia(m.id);
      pl.forgetTrack(m.id);
      await refresh();
      flash('Deleted');
    },
    [queue, trackIx, pl, refresh, flash],
  );

  // Play a saved file, picture included.
  //
  // This used to load everything into an <audio> element, which silently threw
  // the video away and played only its soundtrack. The comment here even called
  // that the desired behaviour for a corner player. It was not: uploading a
  // video and getting sound with no image does not read as a design decision,
  // it reads as broken, and it is not a media player in any sense a person
  // would recognise. One <video> element covers both, since it plays audio-only
  // files exactly as well.
  const playTrack = useCallback(
    async (ix: number, list: MediaMeta[] = queue) => {
      if (ix < 0 || ix >= list.length) return;
      const m = list[ix];
      const blob = await getBlob(m.id);
      if (!blob || !mediaRef.current) return;
      stopVoice();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setHasPicture(false);
      setResolution('');
      setMediaError('');
      mediaRef.current.src = urlRef.current;
      mediaRef.current.volume = volume;
      setFileName(m.title);
      setTrackIx(ix);
      try {
        await mediaRef.current.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    },
    [queue, volume, stopVoice],
  );

  const step = useCallback(
    (delta: number) => {
      if (queue.length === 0) return;
      const next = (trackIx + delta + queue.length) % queue.length;
      void playTrack(next, queue);
    },
    [queue, trackIx, playTrack],
  );

  // Start a track from whatever shelf is on screen, remembering whether that
  // shelf was a playlist so prev/next stay inside it.
  const playFromShelf = useCallback(
    (m: MediaMeta) => {
      const list = openList
        ? (pl.playlists.find((p) => p.id === openList)?.trackIds ?? [])
            .map((id) => vault.find((t) => t.id === id))
            .filter((t): t is MediaMeta => !!t)
        : vault;
      setActiveList(openList);
      void playTrack(list.findIndex((t) => t.id === m.id), list);
    },
    [openList, pl.playlists, vault, playTrack],
  );

  const current = STATIONS.find((s) => s.key === station)!;

  return (
    <div
      className={full ? 'rounded-2xl p-5' : 'compact-ui rounded-2xl p-3'}
      style={{ backgroundColor: theme.panel, border: `1px solid ${theme.line}` }}
    >
      {/* One element for sound and picture. The wrapper is hidden rather than
          unmounted when there is nothing to see, so audio keeps playing: a
          display:none video element still plays its soundtrack, and unmounting
          it would stop the music every time a song followed a film. */}
      <div
        className={
          hasPicture
            ? 'relative mb-3 overflow-hidden rounded-2xl bg-black'
            : 'pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0'
        }
        style={hasPicture ? { boxShadow: `0 0 0 2px ${theme.accent}, 0 12px 30px ${theme.accent}22` } : undefined}
      >
        <video
          ref={mediaRef}
          playsInline
          controls={hasPicture}
          preload="metadata"
          loop={trackIx < 0}
          className={`aspect-video w-full bg-black object-contain ${full ? 'max-h-[70vh]' : 'max-h-60'}`}
          onLoadedMetadata={(e) => {
            const video = e.currentTarget;
            const picture = video.videoWidth > 0 && video.videoHeight > 0;
            setHasPicture(picture);
            setResolution(
              picture ? resolutionLabel(video.videoWidth, video.videoHeight) : '',
            );
            setMediaError('');
          }}
          onCanPlay={() => setMediaError('')}
          onError={() => {
            setPlaying(false);
            setMediaError(
              'This file cannot play here. Try MP4 (H.264/AAC), MP3, M4A, or WAV.',
            );
          }}
          onEnded={() => {
            if (trackIx >= 0 && (tracks?.length ?? 0) > 1) step(1);
            else setPlaying(false);
          }}
        />
        {resolution && (
          <span
            aria-label={`Video resolution ${resolution}`}
            className="pointer-events-none absolute right-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow"
            style={{ backgroundColor: `${theme.accent}E6` }}
          >
            {resolution}
          </span>
        )}
      </div>

      {mediaError && (
        <p
          role="alert"
          className="mb-3 rounded-xl px-3 py-2 text-xs font-semibold"
          style={{ backgroundColor: '#FFF4E5', color: '#9A3412' }}
        >
          {mediaError}
        </p>
      )}

      <div className="mb-2 flex items-center justify-between">
        {/* No name inside the card. On the Library page the heading directly
            above already says what this is, so repeating it was the same word
            twice in two inches. The rail version keeps a label because there is
            no heading above it there. */}
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: theme.inkSoft }}
        >
          {full ? '' : 'Player'}
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          hidden={full}
          aria-label={open ? 'Hide player options' : 'Show player options'}
          aria-expanded={open}
          className="rounded-lg px-2 py-0.5 text-xs font-semibold"
          style={{ color: theme.inkSoft }}
        >
          {open ? '⌄' : '⋯'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        {trackIx >= 0 && (tracks?.length ?? 0) > 1 && (
          <button
            onClick={() => step(-1)}
            aria-label="Previous track"
            className="shrink-0 rounded-lg px-1 text-sm"
            style={{ color: theme.inkSoft }}
          >
            ⏮
          </button>
        )}
        <button
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg transition active:scale-95"
          style={{ backgroundColor: theme.accent, color: '#fff' }}
        >
          <span aria-hidden>{playing ? '❚❚' : '▶'}</span>
        </button>
        {trackIx >= 0 && (tracks?.length ?? 0) > 1 && (
          <button
            onClick={() => step(1)}
            aria-label="Next track"
            className="shrink-0 rounded-lg px-1 text-sm"
            style={{ color: theme.inkSoft }}
          >
            ⏭
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-bold"
            style={{ color: theme.ink }}
            title={fileName || current.label}
          >
            {fileName || `${current.icon} ${current.label}`}
          </p>
          <p className="truncate text-xs" style={{ color: theme.inkSoft }}>
            {fileName
              ? 'From your device'
              : playing
                ? 'Playing'
                : 'Paused'}
          </p>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2">
        <span aria-hidden className="text-xs" style={{ color: theme.inkSoft }}>
          🔈
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="h-1 w-full min-w-0 cursor-pointer appearance-none rounded-full"
          style={{ accentColor: theme.accent, backgroundColor: theme.line }}
        />
      </label>

      {open && (
        <div className="mt-3 space-y-2">
          {/* Which shelf */}
          <div className="grid grid-cols-3 gap-1">
            {([
              ['vault', 'Vault'],
              ['lists', 'Playlists'],
              ['ambience', 'Ambience'],
            ] as const).map(([key, label]) => {
              const on = view === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    setView(key);
                    setOpenList(null);
                    setQuery('');
                  }}
                  className="rounded-lg px-1 py-1.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: on ? theme.accent : 'transparent',
                    color: on ? '#fff' : theme.inkSoft,
                    border: `1px solid ${on ? theme.accent : theme.line}`,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {note && (
            <p className="text-[11px] font-semibold" style={{ color: theme.accent }}>
              {note}
            </p>
          )}

          {/* ---- Vault: everything saved on this device ---- */}
          {view === 'vault' && (
            <div className="space-y-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your media…"
                aria-label="Search your media"
                className="w-full rounded-lg px-2 py-1.5 text-[11px] outline-none"
                style={{
                  backgroundColor: theme.bg,
                  color: theme.ink,
                  border: `1px solid ${theme.line}`,
                }}
              />

              {tracks === null ? (
                <p className="text-[11px]" style={{ color: theme.inkSoft }}>
                  Loading…
                </p>
              ) : shelf.length === 0 ? (
                <p className="text-[11px] leading-snug" style={{ color: theme.inkSoft }}>
                  {query
                    ? 'Nothing matches that.'
                    : 'Your vault is empty. Upload music or video below. It stays on this device.'}
                </p>
              ) : (
                <div className={`thin-scroll space-y-0.5 overflow-y-auto ${full ? "max-h-80" : "max-h-44"}`}>
                  {shelf.map((m) => {
                    const on = queue[trackIx]?.id === m.id;
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-1 rounded-lg px-1.5 py-1"
                        style={{
                          backgroundColor: on ? theme.accent : 'transparent',
                          color: on ? '#fff' : theme.ink,
                        }}
                      >
                        <button
                          onClick={() => playFromShelf(m)}
                          aria-label={`Play ${m.title}`}
                          title={`Play ${m.title}`}
                          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] font-semibold"
                        >
                          <span aria-hidden>{m.type === 'video' ? '🎬' : '🎵'}</span>
                          <span className="truncate">{m.title}</span>
                        </button>
                        <button
                          onClick={() => setAddingFor(addingFor === m.id ? null : m.id)}
                          aria-label={`Add ${m.title} to a playlist`}
                          className="shrink-0 rounded px-1 text-[11px]"
                          style={{ color: on ? '#fff' : theme.inkSoft }}
                        >
                          ＋
                        </button>
                        <button
                          onClick={() => void shareTrack(m)}
                          aria-label={`Share ${m.title}`}
                          className="shrink-0 rounded px-1 text-[11px]"
                          style={{ color: on ? '#fff' : theme.inkSoft }}
                        >
                          ↗
                        </button>
                        <button
                          onClick={() => void removeTrack(m)}
                          aria-label={`Delete ${m.title}`}
                          className="shrink-0 rounded px-1 text-[11px]"
                          style={{ color: on ? '#fff' : '#C2410C' }}
                        >
                          🗑
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add-to-playlist picker for one track. */}
              {addingFor && (
                <div
                  className="rounded-lg p-2"
                  style={{ border: `1px solid ${theme.line}` }}
                >
                  <p className="mb-1 text-[11px] font-bold" style={{ color: theme.ink }}>
                    Add to playlist
                  </p>
                  {pl.playlists.length === 0 ? (
                    <p className="text-[11px]" style={{ color: theme.inkSoft }}>
                      No playlists yet. Make one in the Playlists tab.
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {pl.playlists.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            pl.addTrack(p.id, addingFor);
                            setAddingFor(null);
                            flash(`Added to ${p.name}`);
                          }}
                          className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-semibold"
                          style={{ color: theme.ink }}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <label
                className="block cursor-pointer rounded-lg px-2 py-2 text-center text-[11px] font-semibold"
                style={{ color: theme.inkSoft, border: `1px solid ${theme.line}` }}
              >
                {busy ? 'Saving…' : '⬆️ Save music or video'}
                <input
                  type="file"
                  accept="audio/*,video/*"
                  multiple
                  onChange={upload}
                  className="hidden"
                />
              </label>
              <p className="text-[11px] leading-snug" style={{ color: theme.inkSoft }}>
                Original quality is kept. 4K/60 playback depends on the file,
                browser, device, and display.
              </p>
            </div>
          )}

          {/* ---- Playlists ---- */}
          {view === 'lists' && (
            <div className="space-y-2">
              {openList ? (
                <>
                  <button
                    onClick={() => setOpenList(null)}
                    className="text-[11px] font-semibold"
                    style={{ color: theme.inkSoft }}
                  >
                    ← All playlists
                  </button>
                  <p className="truncate text-[11px] font-bold" style={{ color: theme.ink }}>
                    {pl.playlists.find((p) => p.id === openList)?.name}
                  </p>
                  {shelf.length === 0 ? (
                    <p className="text-[11px]" style={{ color: theme.inkSoft }}>
                      Empty. Add tracks with ＋ in the Vault.
                    </p>
                  ) : (
                    <div className="thin-scroll max-h-40 space-y-0.5 overflow-y-auto">
                      {shelf.map((m) => {
                        const on = queue[trackIx]?.id === m.id;
                        return (
                          <div
                            key={m.id}
                            className="flex items-center gap-1 rounded-lg px-1.5 py-1"
                            style={{
                              backgroundColor: on ? theme.accent : 'transparent',
                              color: on ? '#fff' : theme.ink,
                            }}
                          >
                            <button
                              onClick={() => playFromShelf(m)}
                              aria-label={`Play ${m.title}`}
                              title={`Play ${m.title}`}
                              className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] font-semibold"
                            >
                              <span aria-hidden>{m.type === 'video' ? '🎬' : '🎵'}</span>
                              <span className="truncate">{m.title}</span>
                            </button>
                            <button
                              onClick={() => pl.removeTrack(openList, m.id)}
                              aria-label={`Remove ${m.title} from this playlist`}
                              className="shrink-0 rounded px-1 text-[11px]"
                              style={{ color: on ? '#fff' : theme.inkSoft }}
                            >
                              −
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {pl.playlists.length === 0 ? (
                    <p className="text-[11px] leading-snug" style={{ color: theme.inkSoft }}>
                      No playlists yet. Name one below, then add tracks from the
                      Vault with ＋.
                    </p>
                  ) : (
                    <div className="thin-scroll max-h-40 space-y-0.5 overflow-y-auto">
                      {pl.playlists.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-1 rounded-lg px-1.5 py-1"
                        >
                          <button
                            onClick={() => setOpenList(p.id)}
                            className="min-w-0 flex-1 truncate text-left text-[11px] font-semibold"
                            style={{ color: theme.ink }}
                          >
                            🎧 {p.name}
                            <span style={{ color: theme.inkSoft }}>
                              {' '}
                              · {p.trackIds.length}
                            </span>
                          </button>
                          <button
                            onClick={() => {
                              if (activeList === p.id) setActiveList(null);
                              pl.remove(p.id);
                            }}
                            aria-label={`Delete playlist ${p.name}`}
                            className="shrink-0 rounded px-1 text-[11px]"
                            style={{ color: '#C2410C' }}
                          >
                            🗑
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <form
                    className="flex gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newList.trim()) return;
                      pl.create(newList);
                      setNewList('');
                      flash('Playlist created');
                    }}
                  >
                    <input
                      value={newList}
                      onChange={(e) => setNewList(e.target.value)}
                      placeholder="New playlist…"
                      aria-label="New playlist name"
                      className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-[11px] outline-none"
                      style={{
                        backgroundColor: theme.bg,
                        color: theme.ink,
                        border: `1px solid ${theme.line}`,
                      }}
                    />
                    <button
                      type="submit"
                      className="shrink-0 rounded-lg px-2 text-[11px] font-bold text-white"
                      style={{ backgroundColor: theme.accent }}
                    >
                      Add
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          {/* ---- Ambience: synthesised in the browser, no files ---- */}
          {view === 'ambience' && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1">
                {STATIONS.map((s) => {
                  const on = !fileName && s.key === station;
                  return (
                    <button
                      key={s.key}
                      onClick={() => pick(s.key)}
                      className="rounded-lg px-1 py-2 text-[11px] font-semibold transition"
                      style={{
                        backgroundColor: on ? theme.accent : 'transparent',
                        color: on ? '#fff' : theme.inkSoft,
                        border: `1px solid ${on ? theme.accent : theme.line}`,
                      }}
                    >
                      <span aria-hidden className="block text-base">
                        {s.icon}
                      </span>
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {(fileName || trackIx >= 0) && (
                <button
                  onClick={clearFile}
                  className="w-full rounded-lg px-2 py-2 text-[11px] font-semibold"
                  style={{ color: theme.inkSoft, border: `1px solid ${theme.line}` }}
                >
                  Back to ambience
                </button>
              )}
              <p className="text-[11px] leading-snug" style={{ color: theme.inkSoft }}>
                Ambience is made in your browser. Nothing to download, works
                offline.
              </p>
            </div>
          )}

          <p className="text-[11px] leading-snug" style={{ color: theme.inkSoft }}>
            Your files stay on this device and are never uploaded.
          </p>
        </div>
      )}
    </div>
  );
}
