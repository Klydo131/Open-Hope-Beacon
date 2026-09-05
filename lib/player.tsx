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
import { KINDS, VOICES, noiseBuffer, voiceFor, type AmbienceKind, type Voice } from '@/lib/noise';

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
  // Where the generated sound leaves the graph. See `openOutput`.
  const sink = useRef<MediaStreamAudioDestinationNode | null>(null);
  // The shaping between the source and the master gain: a low-pass that takes
  // the hiss off, and a slowly swelling gain driven by its own oscillator so
  // the sound breathes. Held in refs because every one of them has to be
  // stopped and disconnected when the sound stops -- an oscillator left
  // running is a leak that survives the next twenty presses of play.
  const shape = useRef<{ nodes: AudioNode[]; lfo: OscillatorNode | null }>({ nodes: [], lfo: null });
  // A chime has no buffer and no loop: it schedules struck notes on a timer.
  // The timer has to be cleared when the sound stops or it keeps striking
  // into a graph that is no longer connected to anything.
  // A CHAIN OF TIMEOUTS, NOT AN INTERVAL, because each wait is a different
  // length -- a fixed interval would be a metronome, which is the one thing a
  // wind chime never is.
  const striker = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef<OscillatorNode[]>([]);

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
    if (striker.current) { clearTimeout(striker.current); striker.current = null; }
    for (const osc of held.current) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    held.current = [];
    try { shape.current.lfo?.stop(); } catch { /* already stopped */ }
    for (const node of shape.current.nodes) {
      try { node.disconnect(); } catch { /* already gone */ }
    }
    shape.current = { nodes: [], lfo: null };
    if (sink.current && media.current) {
      try { media.current.pause(); } catch { /* not playing */ }
    }
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
  /**
   * A struck note that rings and fades. The whole of a wind chime.
   *
   * TWO OSCILLATORS, NOT ONE. A single sine is a test tone; what makes a struck
   * bell sound struck is a second, quieter partial slightly out of tune with
   * the first, so the two drift against each other as they fade. That beating
   * is most of the character, and it costs one extra oscillator.
   *
   * The envelope is the rest of it: almost no attack, then a long exponential
   * fall. `exponentialRampToValueAtTime` cannot reach zero -- it is undefined
   * at 0 -- so it aims at a value near silence and the note is stopped after.
   */
  const strike = useCallback((c: AudioContext, to: AudioNode, hz: number, level: number) => {
    const now = c.currentTime;
    const ring = 3.5 + Math.random() * 2.5;

    const shell = c.createGain();
    shell.gain.setValueAtTime(0.0001, now);
    shell.gain.exponentialRampToValueAtTime(level, now + 0.01);
    shell.gain.exponentialRampToValueAtTime(0.0001, now + ring);
    shell.connect(to);

    for (const [ratio, share] of [[1, 1], [2.76, 0.28]] as const) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      // 2.76 is roughly the first inharmonic partial of a struck bar, which is
      // why it reads as metal rather than as a flute.
      osc.frequency.value = hz * ratio;
      const part = c.createGain();
      part.gain.value = share;
      osc.connect(part);
      part.connect(shell);
      osc.start(now);
      osc.stop(now + ring + 0.1);
    }
  }, []);

  /**
   * Send the generated sound somewhere a phone will actually play it.
   *
   * WHY NOT SIMPLY `connect(ctx.destination)`, WHICH IS WHAT THIS USED TO DO.
   * On iOS the hardware ring/silent switch mutes the Web Audio API, and does
   * NOT mute a media element. So on an iPhone with the switch flicked to
   * silent -- which is how a great many people keep a phone in church, and how
   * it will be during the demo -- every ambience sound was dead silent while
   * ordinary media still played. Nothing in the graph is wrong, and nothing in
   * the graph can fix it: the fault is which output the sound is asked to
   * leave by.
   *
   * Routing through a MediaStream attached to the player's own media element
   * makes the browser treat it as media rather than as effects, which is what
   * it is. It also puts the ambience under the volume buttons and into the
   * lock screen, both of which are improvements in their own right.
   *
   * IT FALLS BACK, AND THE FALLBACK MATTERS MORE THAN THE FEATURE. If this
   * route is missing or the element refuses to play, the sound goes straight
   * to the speakers exactly as it did before. A device that works today cannot
   * be made worse by this, which is the only condition on which it was worth
   * changing an audio path days before a demo nobody can re-run.
   */
  const openOutput = useCallback((c: AudioContext, master: GainNode) => {
    const direct = () => {
      try { master.connect(c.destination); } catch { /* already connected */ }
    };
    let out: MediaStreamAudioDestinationNode;
    try {
      if (typeof c.createMediaStreamDestination !== 'function') { direct(); return; }
      out = c.createMediaStreamDestination();
      master.connect(out);
      const el = element();
      el.srcObject = out.stream;
      el.muted = false;
      sink.current = out;
    } catch {
      direct();
      return;
    }
    // A rejected play() means the stream is going nowhere, so take the old
    // route instead. Connecting only here keeps the two from ever both
    // sounding at once, which would play everything at twice the level.
    void el_play(element(), direct);
  }, [element]);

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

    if (!gain.current) {
      gain.current = c.createGain();
      openOutput(c, gain.current);
    } else if (sink.current) {
      // THE ELEMENT IS THE OUTPUT NOW, AND IT DOES NOT STAY PUT. `play()`
      // pauses it before starting ambience and detaches the stream when a real
      // track is chosen; `stopNoise` pauses it again on the way through here.
      // Wiring it once when the graph was created was therefore not enough --
      // the second voice somebody picked would build a perfect graph into an
      // output that was paused, or detached, and play nothing at all.
      const el = element();
      if (el.srcObject !== sink.current.stream) {
        el.removeAttribute('src');
        el.srcObject = sink.current.stream;
      }
      el.muted = false;
      void el_play(el, () => {});
    }
    gain.current.gain.value = v;

    // -----------------------------------------------------------------------
    // NOTES RATHER THAN NOISE
    // -----------------------------------------------------------------------
    //
    // "These are all White noises, and most of it sounds static with flavor."
    // That was a fair verdict and no amount of filtering answers it: shaping a
    // hiss makes a nicer hiss. These two engines do not loop a buffer at all,
    // so there is nothing to repeat and nothing for the ear to lock onto.
    if (voice.engine === 'chime' && voice.notes?.length) {
      const notes = voice.notes;
      // Quiet, because a bell is a transient and a transient at the same
      // nominal level as a continuous hiss sounds twice as loud.
      // MEASURED, NOT GUESSED. Rendering every voice offline put the noise
      // voices at 0.09-0.12 RMS and this one at 0.018 -- about six times
      // quieter. On a phone speaker in a room that is not "soft", it is
      // nothing, and it was reported as no audio at all. Raised until a
      // repeated strike lands in the same range as the rest.
      const level = 0.34;
      // AND THE SILENCE BETWEEN THEM MATTERED AS MUCH AS THE LEVEL. At the
      // old spacing a chime could be quiet for nearly five seconds and the
      // bells for nearly ten, which is far longer than anybody waits before
      // deciding a sound is broken. Still irregular, just not absent.
      const gap = voice.key === 'chapel-bells' ? 4200 : 1900;
      const ring = () => {
        const hz = notes[Math.floor(Math.random() * notes.length)];
        strike(c, gain.current as AudioNode, hz, level);
      };
      ring();
      // A FIXED INTERVAL WOULD BE A METRONOME, which is the one thing a wind
      // chime never is. Each wait is randomised around the gap so the pattern
      // never settles into something countable.
      const tick = () => {
        striker.current = setTimeout(() => {
          ring();
          tick();
        }, gap * (0.45 + Math.random()));
      };
      tick();
      source.current = null;
      shape.current = { nodes: [], lfo: null };
      return;
    }

    if (voice.engine === 'pad' && voice.notes?.length) {
      // A HELD CHORD THAT DRIFTS. Each note gets its own slow swell at its own
      // rate, so they move against one another and the chord never sits still.
      // Rates are deliberately unrelated -- 0.031, 0.043, 0.057 -- so the whole
      // never lines back up into a pulse.
      const made: AudioNode[] = [];
      voice.notes.forEach((hz, i) => {
        const osc = c.createOscillator();
        osc.type = 'triangle';   // one soft harmonic more than a sine, no edge
        osc.frequency.value = hz;

        const swell = c.createGain();
        // "Very soft music" was the ask, and 0.055 overshot it into inaudible:
        // 0.05 RMS against 0.12 for the white noise, through a 900Hz lid, on a
        // speaker the size of a coin. This is still the quietest voice here.
        const depth = 0.10;
        swell.gain.value = depth;

        const lfo = c.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.031 + i * 0.012;
        const amount = c.createGain();
        amount.gain.value = depth * 0.7;
        lfo.connect(amount);
        amount.connect(swell.gain);
        lfo.start();

        // A gentle low-pass so the triangle's upper harmonics never get glassy.
        const soft = c.createBiquadFilter();
        soft.type = 'lowpass';
        // A PHONE SPEAKER HAS ALMOST NO OUTPUT BELOW ABOUT 500Hz. A chord this
        // low with a 900Hz lid has nearly nothing left that a handset can
        // actually move air with; opening it up keeps the warmth without
        // making the triangle glassy.
        soft.frequency.value = 1400;
        soft.Q.value = 0.6;

        osc.connect(soft);
        soft.connect(swell);
        swell.connect(gain.current as AudioNode);
        osc.start();

        held.current.push(osc, lfo);
        made.push(swell, amount, soft);
      });
      source.current = null;
      shape.current = { nodes: made, lfo: null };
      return;
    }

    const node = c.createBufferSource();
    node.buffer = noiseBuffer(c, voice.colour);
    node.loop = true;

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
  }, [stopNoise, strike, element, openOutput]);

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
    // srcObject wins over src where both are set, so a leftover ambience
    // stream would silently swallow every track somebody chose afterwards.
    // Detach the stream but KEEP the sink: the audio graph is still wired to
    // it, so throwing the reference away here would leave every later ambience
    // choice building sound into an output nothing is listening to.
    el.srcObject = null;
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

/**
 * Start a media element, and say so if it refuses.
 *
 * Split out because a rejected promise inside a `useCallback` is easy to
 * swallow by accident, and swallowing this one is the difference between
 * sound and silence.
 */
function el_play(el: HTMLVideoElement, onRefused: () => void): Promise<void> {
  try {
    const started = el.play();
    if (!started || typeof started.catch !== 'function') return Promise.resolve();
    return started.catch(() => { onRefused(); });
  } catch {
    onRefused();
    return Promise.resolve();
  }
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
