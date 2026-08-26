'use client';

// Ambient sound, generated rather than downloaded.
//
// WHY NOT AUDIO FILES. An hour of white noise is tens of megabytes. Serving it
// to a congregation would cost real egress every time somebody pressed play,
// on a project whose whole point is running for nothing, and it would not work
// on the bus. Generated noise is a few lines of arithmetic: no file, no
// bandwidth, no network, and it never ends because there is nothing to end.
//
// THREE COLOURS, and they are not decoration. White is flat and harsh and
// masks speech best. Pink falls 3dB per octave, which is roughly how rain and
// wind actually sound, and is what most people mean by "white noise". Brown
// falls 6dB and reads as distant surf. Somebody studying for an hour will care
// which one they are listening to.

export type NoiseColour = 'white' | 'pink' | 'brown';

export const NOISE: { key: NoiseColour; label: string; blurb: string }[] = [
  { key: 'pink', label: 'Rainfall', blurb: 'Soft and even, like rain on a roof' },
  { key: 'brown', label: 'Distant surf', blurb: 'Deeper, further away' },
  { key: 'white', label: 'Plain hush', blurb: 'Flat and bright, masks voices best' },
];

/**
 * A few seconds of noise, looped.
 *
 * Two seconds rather than a fraction of one: a short buffer repeats often
 * enough that the ear finds the seam and starts hearing a pulse.
 */
export function noiseBuffer(ctx: AudioContext, colour: NoiseColour): AudioBuffer {
  const seconds = 2;
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const out = buffer.getChannelData(0);

  if (colour === 'white') {
    for (let i = 0; i < length; i += 1) out[i] = Math.random() * 2 - 1;
    return buffer;
  }

  if (colour === 'brown') {
    // A running sum, damped. Left undamped it wanders off the rails and
    // clips; 0.02 keeps it inside while still falling 6dB per octave.
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      out[i] = last * 3.5;
    }
    return buffer;
  }

  // Pink: Paul Kellet's economy filter. Seven poles, cheap enough to fill two
  // seconds of buffer without the page stuttering on a low-end phone.
  let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buffer;
}
