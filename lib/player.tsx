'use client';

// One media player, shared by every screen that shows it.
//
// WHY A CONTEXT AND NOT A COMPONENT. The player appears twice: full size on the
// library page, and as a strip in the right rail of every room. Those are two
// views of ONE thing. Built as two components each holding their own <audio>,
// pressing play in the rail while the library was playing would give you both
// at once, and navigating from the library to anywhere else would cut the
// sound off mid-track. The audio element lives here, above both, and outlives
// the page.
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
import { NOISE, noiseBuffer, type NoiseColour } from '@/lib/noise';

export function playerCredit(): string {
  return (process.env.NEXT_PUBLIC_PLAYER_CREDIT ?? '').trim();
}

export interface Track {
  id: string;
  title: string;
  /** A URL for real audio, or absent for a generated ambience. */
  url?: string;
  /** Set when this is generated rather than fetched. */
  noise?: NoiseColour;
  icon?: string;
}

interface PlayerValue {
  current: Track | null;
  playing: boolean;
  volume: number;
  queue: Track[];
  play: (track: Track, queue?: Track[]) => void;
  toggle: () => void;
  next: () => void;
  stop: () => void;
  setVolume: (v: number) => void;
}

const Ctx = createContext<PlayerValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  // Web Audio, only for generated ambience. Created on the first press rather
  // than at mount: a browser will not let a page make sound before somebody
  // asks for it, and an AudioContext built too early starts suspended and
  // stays that way on iOS.
  const ctx = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const gain = useRef<GainNode | null>(null);

  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const [volume, setVol] = useState(0.6);

  const stopNoise = useCallback(() => {
    try { source.current?.stop(); } catch { /* already stopped */ }
    source.current = null;
  }, []);

  const startNoise = useCallback((colour: NoiseColour, v: number) => {
    if (!ctx.current) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx.current = new Ctor();
    }
    const c = ctx.current;
    void c.resume();
    stopNoise();
    const node = c.createBufferSource();
    node.buffer = noiseBuffer(c, colour);
    node.loop = true;
    if (!gain.current) { gain.current = c.createGain(); gain.current.connect(c.destination); }
    gain.current.gain.value = v;
    node.connect(gain.current);
    node.start();
    source.current = node;
  }, [stopNoise]);

  const play = useCallback((track: Track, nextQueue?: Track[]) => {
    if (nextQueue) setQueue(nextQueue);
    setCurrent(track);
    setPlaying(true);

    if (track.noise) {
      audio.current?.pause();
      startNoise(track.noise, volume);
      return;
    }
    stopNoise();
    if (!audio.current) audio.current = new Audio();
    audio.current.src = track.url ?? '';
    audio.current.volume = volume;
    void audio.current.play().catch(() => setPlaying(false));
  }, [startNoise, stopNoise, volume]);

  const toggle = useCallback(() => {
    if (!current) return;
    if (playing) {
      if (current.noise) stopNoise(); else audio.current?.pause();
      setPlaying(false);
      return;
    }
    if (current.noise) startNoise(current.noise, volume);
    else void audio.current?.play().catch(() => setPlaying(false));
    setPlaying(true);
  }, [current, playing, startNoise, stopNoise, volume]);

  const next = useCallback(() => {
    if (!current || queue.length === 0) return;
    const at = queue.findIndex((t) => t.id === current.id);
    const following = queue[at + 1];
    if (following) play(following, queue);
  }, [current, queue, play]);

  const stop = useCallback(() => {
    stopNoise();
    audio.current?.pause();
    setPlaying(false);
    setCurrent(null);
  }, [stopNoise]);

  const setVolume = useCallback((v: number) => {
    setVol(v);
    if (audio.current) audio.current.volume = v;
    if (gain.current) gain.current.gain.value = v;
  }, []);

  // A finished track moves the queue on by itself. Ambience never ends, so
  // this only ever concerns real audio.
  useEffect(() => {
    if (!audio.current) audio.current = new Audio();
    const el = audio.current;
    const onEnd = () => next();
    el.addEventListener('ended', onEnd);
    return () => el.removeEventListener('ended', onEnd);
  }, [next]);

  const value = useMemo(
    () => ({ current, playing, volume, queue, play, toggle, next, stop, setVolume }),
    [current, playing, volume, queue, play, toggle, next, stop, setVolume],
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

/** The generated ambience, as tracks. Always available, needs no network. */
export const AMBIENCE: Track[] = NOISE.map((n) => ({
  id: `ambience-${n.key}`,
  title: n.label,
  noise: n.key,
  icon: n.key === 'pink' ? '🌧️' : n.key === 'brown' ? '🌊' : '🌫️',
}));
