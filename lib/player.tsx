'use client';

// One media player, shared by every screen that shows it.
//
// WHY A CONTEXT AND NOT A COMPONENT. The player appears twice: full size on the
// library page, and as a strip in the right rail of every room. Those are two
// views of ONE thing. Built as two components each holding their own element,
// pressing play in the rail while the library was playing would give you both
// at once, and navigating from the library to anywhere else would cut the
// sound off mid-track. The element lives here, above both, and outlives the
// page. The provider sits in the ROOT LAYOUT, so it survives moving between
// routes too.
//
// ONE ELEMENT, AND IT IS A <video>. An <audio> element cannot show a picture,
// and a second element for video would be a second thing that can be playing.
// A <video> plays audio perfectly well, so there is one, created imperatively
// and parked in a hidden corner of the document. When the full player mounts it
// ADOPTS that element into its own stage; when it unmounts the element goes
// back to the corner, still playing. That is why a video keeps its sound when
// you walk out of the library, and picks its picture back up when you return.
//
// It has to stay IN the document either way. A detached media element is
// throttled or stopped outright by most browsers, so the parking spot is a
// real, visually hidden node rather than nothing.
//
// THE CREDIT LINE IS A DEPLOYMENT SETTING WITH NO DEFAULT.
//
// This repository is AGPL-3.0 and public. The owner's player is a separate,
// private product, and it was in this repository once already, branded, for
// weeks; tests/no-backend.js now refuses its name by NAME rather than by file,
// precisely so a copied component cannot put it back. That check is right and
// it caught me writing the name into a constant.
//
// So the source contains no product name at all. A deployment that is entitled
// to one sets NEXT_PUBLIC_PLAYER_CREDIT and the player prints it; a fork sets
// nothing and the line simply does not draw. The name lives in the deployment
// that owns it, which is the only place it can live without publishing it.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { KINDS, VOICES, noiseBuffer, voiceFor, type AmbienceKind } from '@/lib/noise';

export function playerCredit(): string {
  return (process.env.NEXT_PUBLIC_PLAYER_CREDIT ?? '').trim();
}

export interface Track {
  id: string;
  title: string;
  /** A URL for real media, or absent for a generated ambience. */
  url?: string;
  /**
   * Set when this is generated rather than fetched: the key of a voice in
   * lib/noise.ts. It used to be the noise COLOUR, which could not tell
   * "Rainfall" from "Night wind" -- both are pink, and the difference between
   * them is the filter and the swell, not the arithmetic that makes the
   * samples.
   */
  noise?: string;
  /** True when there is a picture to show. */
  video?: boolean;
  icon?: string;
  /**
   * One line saying what it sounds like. Ambience only, and the point of it:
   * every voice has carried this text since the file was written and no screen
   * had ever drawn one, so the fact that "Plain hush" is the harsh one lived
   * in the source and nowhere a listener could read it.
   */
  blurb?: string;
}

interface PlayerValue {
  current: Track | null;
  playing: boolean;
  volume: number;
  muted: boolean;
  queue: Track[];
  /** Seconds. Zero for generated ambience, which has no length. */
  position: number;
  duration: number;
  /** True while the browser is still fetching enough to play. */
  loading: boolean;
  play: (track: Track, queue?: Track[]) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  /** Move by a number of seconds, positive or negative. */
  nudge: (seconds: number) => void;
  stop: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  /**
   * Hands the video element to a container that wants to show it, and gives it
   * back when that container goes away. Returns a cleanup function.
   */
  attachVideo: (host: HTMLElement | null) => void;
  hasVideo: boolean;
}

const Ctx = createContext<PlayerValue | null>(null);

/** Where the element lives when nothing is showing it. */
function parkingSpot(): HTMLElement {
  const id = 'beacon-player-park';
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement('div');
    node.id = id;
    // Visually hidden but genuinely in the document and genuinely laid out.
    // `display:none` and `visibility:hidden` both let a browser stop the
    // media, which is the one thing this must never do.
    node.style.cssText =
      'position:fixed;left:0;bottom:0;width:1px;height:1px;overflow:hidden;'
      + 'opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(node);
  }
  return node;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const media = useRef<HTMLVideoElement | null>(null);
  const host = useRef<HTMLElement | null>(null);
  // Web Audio, only for generated ambience. Created on the first press rather
  // than at mount: a browser will not let a page make sound before somebody
  // asks for it, and an AudioContext built too early starts suspended and
  // stays that way on iOS.
  const ctx = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const gain = useRef<GainNode | null>(null);
  // The shaping between the source and the master gain: a low-pass that takes
  // the hiss off, and a slowly swelling gain driven by its own oscillator so
  // the sound breathes. Held in refs because every one of them has to be
  // stopped and disconnected when the sound stops -- an oscillator left
  // running is a leak that survives the next twenty presses of play.
  const shape = useRef<{ nodes: AudioNode[]; lfo: OscillatorNode | null }>({ nodes: [], lfo: null });

  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const [volume, setVol] = useState(0.6);
  const [muted, setMuted] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);

  /** The one element, made once, parked when nothing is showing it. */
  const element = useCallback((): HTMLVideoElement => {
    if (media.current) return media.current;
    const el = document.createElement('video');
    el.playsInline = true;
    el.preload = 'metadata';
    el.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;display:block';
    media.current = el;
    (host.current ?? parkingSpot()).appendChild(el);
    return el;
  }, []);

  const stopNoise = useCallback(() => {
    try { source.current?.stop(); } catch { /* already stopped */ }
    source.current = null;
    // The oscillator driving the swell is a second source and does not stop
    // when the noise does. Left running it keeps the AudioContext awake and
    // accumulates one more every time somebody changes sound.
    try { shape.current.lfo?.stop(); } catch { /* already stopped */ }
    for (const node of shape.current.nodes) {
      try { node.disconnect(); } catch { /* already gone */ }
    }
    shape.current = { nodes: [], lfo: null };
  }, []);

  /**
   * Build the sound: a looping buffer, softened, and made to breathe.
   *
   *   buffer -> [low-pass] -> [swelling gain] -> master gain -> speakers
   *
   * THE TWO OPTIONAL STAGES ARE WHY IT IS PLEASANT, and both were missing.
   *
   * The LOW-PASS removes the energy above a couple of kilohertz. That band is
   * the whole difference between a sound like weather and a sound like a hiss,
   * and it is why the raw white noise was the one people complained about.
   *
   * The SWELL is a slow sine on the gain -- one rise and fall every twenty to
   * thirty seconds. A buffer looped at a fixed level is a wall, and a wall is
   * tiring however well chosen its colour. This is deliberately NOT baked into
   * the buffer: the buffer is two seconds long, so a swell inside it would
   * repeat every two seconds and be heard as a pulse, which is the exact
   * artefact the buffer is two seconds long to avoid. On its own oscillator it
   * never lines up with the loop.
   *
   * A voice with neither stage is played raw, which is what "Plain hush" is
   * for and the reason it is still here.
   */
  const startNoise = useCallback((key: string, v: number) => {
    if (!ctx.current) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx.current = new Ctor();
    }
    const c = ctx.current;
    void c.resume();
    stopNoise();

    // An unknown key plays rather than falling silent: a playlist saved before
    // a voice was renamed should sound like something.
    const voice = voiceFor(key) ?? VOICES[0];

    const node = c.createBufferSource();
    node.buffer = noiseBuffer(c, voice.colour);
    node.loop = true;

    if (!gain.current) { gain.current = c.createGain(); gain.current.connect(c.destination); }
    gain.current.gain.value = v;

    const made: AudioNode[] = [];
    let tail: AudioNode = node;

    if (voice.cutoff) {
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = voice.cutoff;
      // Left at the default 1, a biquad lifts the response right at the corner
      // -- a faint whistle exactly where the sound is supposed to go quiet.
      // Below 0.707 the knee is gentle and there is no peak at all.
      filter.Q.value = 0.6;
      tail.connect(filter);
      made.push(filter);
      tail = filter;

      // GIVE BACK WHAT THE FILTER TOOK. A low-pass removes real energy, and a
      // heavy one removes most of it, so without this the gentler choice would
      // simply sound like the volume had broken. See `trim` in lib/noise.ts
      // for where the numbers come from and how confident to be about them.
      if (voice.trim && voice.trim !== 1) {
        const lift = c.createGain();
        lift.gain.value = voice.trim;
        tail.connect(lift);
        made.push(lift);
        tail = lift;
      }
    }

    let lfo: OscillatorNode | null = null;
    if (voice.sway) {
      const swell = c.createGain();
      // The swell rides on top, so the loudest moment is the level the person
      // chose on the slider and every other moment is quieter. Centring it
      // instead would make the sound louder than the slider says at the peak.
      swell.gain.value = 1 - voice.sway.depth;

      lfo = c.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = voice.sway.hz;
      const depth = c.createGain();
      depth.gain.value = voice.sway.depth;
      lfo.connect(depth);
      depth.connect(swell.gain);
      lfo.start();

      tail.connect(swell);
      made.push(swell, depth);
      tail = swell;
    }

    tail.connect(gain.current);
    node.start();
    source.current = node;
    shape.current = { nodes: made, lfo };
  }, [stopNoise]);

  const play = useCallback((track: Track, nextQueue?: Track[]) => {
    if (nextQueue) setQueue(nextQueue);
    setCurrent(track);
    setPlaying(true);
    setPosition(0);
    setDuration(0);

    if (track.noise) {
      // Generated sound has no file and no length. Pause rather than clear the
      // element's source: clearing it makes some browsers fire an error event.
      element().pause();
      setLoading(false);
      startNoise(track.noise, muted ? 0 : volume);
      return;
    }
    stopNoise();
    const el = element();
    setLoading(true);
    el.src = track.url ?? '';
    el.volume = volume;
    el.muted = muted;
    void el.play().catch(() => { setPlaying(false); setLoading(false); });
  }, [element, startNoise, stopNoise, volume, muted]);

  const toggle = useCallback(() => {
    if (!current) return;
    if (playing) {
      if (current.noise) stopNoise(); else element().pause();
      setPlaying(false);
      return;
    }
    if (current.noise) startNoise(current.noise, muted ? 0 : volume);
    else void element().play().catch(() => setPlaying(false));
    setPlaying(true);
  }, [current, playing, element, startNoise, stopNoise, volume, muted]);

  const step = useCallback((by: 1 | -1) => {
    if (!current || queue.length === 0) return;
    const at = queue.findIndex((t) => t.id === current.id);
    const target = queue[at + by];
    if (target) play(target, queue);
  }, [current, queue, play]);

  const next = useCallback(() => step(1), [step]);

  /**
   * Back a track, or back to the start of this one.
   *
   * The behaviour every media player has, and the reason is that pressing back
   * once almost always means "play that again from the beginning". Jumping to
   * the previous track on the first press loses what you were listening to.
   */
  const previous = useCallback(() => {
    if (!current) return;
    if (!current.noise && element().currentTime > 3) {
      element().currentTime = 0;
      setPosition(0);
      return;
    }
    step(-1);
  }, [current, element, step]);

  const seek = useCallback((seconds: number) => {
    if (!current || current.noise) return;
    const el = element();
    const clamped = Math.max(0, Math.min(seconds, el.duration || 0));
    el.currentTime = clamped;
    setPosition(clamped);
  }, [current, element]);

  const nudge = useCallback((seconds: number) => {
    if (!current || current.noise) return;
    seek((element().currentTime || 0) + seconds);
  }, [current, element, seek]);

  const stop = useCallback(() => {
    stopNoise();
    const el = media.current;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    setPlaying(false);
    setCurrent(null);
    setPosition(0);
    setDuration(0);
  }, [stopNoise]);

  const setVolume = useCallback((v: number) => {
    setVol(v);
    // Moving the slider off zero is how people unmute, so treat it as that.
    if (v > 0 && muted) setMuted(false);
    if (media.current) { media.current.volume = v; media.current.muted = v === 0 ? media.current.muted : false; }
    if (gain.current) gain.current.gain.value = v;
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const nextMuted = !m;
      if (media.current) media.current.muted = nextMuted;
      if (gain.current) gain.current.gain.value = nextMuted ? 0 : volume;
      return nextMuted;
    });
  }, [volume]);

  /**
   * Adopt the element into a visible stage, or hand it back to the parking spot.
   *
   * Moving a playing media element between parents does NOT interrupt it, which
   * is the whole reason this works. Re-creating one would.
   */
  const attachVideo = useCallback((next: HTMLElement | null) => {
    host.current = next;
    const el = media.current;
    if (!el) return;
    (next ?? parkingSpot()).appendChild(el);
  }, []);

  // Everything the element tells us. One listener set, added once.
  useEffect(() => {
    const el = element();
    const onTime = () => setPosition(el.currentTime || 0);
    const onMeta = () => {
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
      setLoading(false);
    };
    const onEnd = () => next();
    const onWait = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onPause = () => setPlaying(false);
    const onPlayEv = () => setPlaying(true);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('ended', onEnd);
    el.addEventListener('waiting', onWait);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('pause', onPause);
    el.addEventListener('play', onPlayEv);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('waiting', onWait);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('play', onPlayEv);
    };
  }, [element, next]);

  const value = useMemo(
    () => ({
      current, playing, volume, muted, queue, position, duration, loading,
      play, toggle, next, previous, seek, nudge, stop, setVolume, toggleMute,
      attachVideo, hasVideo: Boolean(current?.video),
    }),
    [current, playing, volume, muted, queue, position, duration, loading,
     play, toggle, next, previous, seek, nudge, stop, setVolume, toggleMute, attachVideo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Returns null outside the provider rather than throwing.
 *
 * The rail renders on screens that do not mount a player, and a hook that
 * throws there would take a whole page down to hide a volume slider.
 */
export function usePlayer(): PlayerValue | null {
  return useContext(Ctx);
}

/** mm:ss, or h:mm:ss past an hour. Empty for a length nobody knows yet. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The generated ambience, as tracks. Always available, needs no network. */
export const AMBIENCE: Track[] = VOICES.map((v) => ({
  id: `ambience-${v.key}`,
  title: v.label,
  noise: v.key,
  icon: v.icon,
  blurb: v.blurb,
}));

/**
 * The same sounds, in their two groups, for a screen to draw under headings.
 *
 * WHY THIS IS A LIST AND NOT TWO ARRAYS. The player is drawn in two places --
 * the rail and the full sheet -- and they had already drifted apart once. One
 * shape they both map over is one place to add a third group.
 *
 * Empty groups are dropped, so removing the last white-noise voice removes the
 * heading with it rather than leaving a category label over nothing.
 */
export const AMBIENCE_GROUPS: {
  kind: AmbienceKind;
  heading: string;
  note: string;
  tracks: Track[];
}[] = KINDS
  .map((k) => ({
    ...k,
    tracks: AMBIENCE.filter((t) => voiceFor(t.noise ?? '')?.kind === k.kind),
  }))
  .filter((g) => g.tracks.length > 0);
