// A photograph in a conversation is shown, not named.
//
// THE REPORT, with a screenshot of a photo rendered as a blue underlined
// filename: "I should see the image or video in my chat, not the document file
// please."
//
// THE PART WORTH RECORDING is that the sample side had done this correctly for
// months. components/Attachment.tsx draws an image as an image, an audio file
// as a player and a video as a video; the live conversation drew all three as
// a paperclip and a filename. So somebody learned the app in the tutorial,
// signed in, sent their Guide a photograph, and got `20260901_110714.jpg`.
//
// That is the parity rule this project keeps writing down and keeps breaking:
// a change to one side is usually a bug on the other. This file is the check
// that was missing.

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');

const live = strip(readFileSync('components/live/shared.tsx', 'utf8'));
const demo = strip(readFileSync('components/Attachment.tsx', 'utf8'));

// ---------------------------------------------------------------------------
// 1. Both sides draw the thing itself.
// ---------------------------------------------------------------------------
{
  const attachment = live.slice(live.indexOf('export function LiveAttachment'));

  ok(/isImage/.test(attachment) && /<img/.test(attachment),
     'the live conversation draws a picture as a picture');
  ok(/isAudio/.test(attachment) && /<audio/.test(attachment),
     'and a voice note as something you can press play on');
  ok(/📎 \{file\.title\}/.test(attachment),
     'and still names anything else, which is right for a study sheet');

  ok(/<img/.test(demo) && /<audio/.test(demo),
     'the sample side does the same, as it already did');
}

// ---------------------------------------------------------------------------
// 2. Egress is the bill, so nothing is fetched before it is looked at.
// ---------------------------------------------------------------------------
// A private file is fetched through a signed link that no cache will keep, so
// every picture drawn is paid for again every time the thread is opened. A
// conversation with thirty photographs in it would otherwise download all
// thirty to show the newest message.
{
  const attachment = live.slice(live.indexOf('export function LiveAttachment'));
  ok(/loading="lazy"/.test(attachment),
     'a picture further up the thread is not fetched until it is scrolled to');
  ok(/preload="none"/.test(attachment),
     'and a voice note downloads nothing until it is played');
}

// ---------------------------------------------------------------------------
// 3. Anything the browser cannot draw falls back to the filename.
// ---------------------------------------------------------------------------
// HEIC is in the upload allowlist and Safari can draw it while Chrome and
// Firefox cannot, so a check on the mime type alone would leave Android users
// with a broken image icon. The same fallback covers a signed link that expired
// while the tab sat open.
{
  const attachment = live.slice(live.indexOf('export function LiveAttachment'));
  ok(/onError=\{\(\) => setBroken\(true\)\}/.test(attachment),
     'a picture that will not draw falls back to the filename');
  ok((attachment.match(/onError=\{\(\) => setBroken\(true\)\}/g) ?? []).length >= 2,
     'and so does a voice note that will not play');
  ok(/&& !broken/.test(attachment),
     'the fallback is what decides the shape, rather than the mime type alone');
}

// ---------------------------------------------------------------------------
// 4. The signed link is never stored.
// ---------------------------------------------------------------------------
{
  const attachment = live.slice(live.indexOf('export function LiveAttachment'));
  ok(/live\.pairingFileUrl\(file\.path\)/.test(attachment),
     'the link is signed at render time');
  ok(/const fresh = await live\.pairingFileUrl\(file\.path\)/.test(attachment),
     'and signed again when somebody opens the full size, rather than reusing an hour-old one');
}

// ---------------------------------------------------------------------------
// 5. Video is absent on purpose, and the app says why.
// ---------------------------------------------------------------------------
// One phone video is the storage of a hundred photographs, paid again on every
// view. It is the single thing most likely to end this church's free plan, so
// it is not in the bucket's allowlist and the composer says what to do instead.
{
  const bucket = readFileSync('supabase/migrations/0048_a_study_sheet_is_a_word_document.sql', 'utf8');
  const allow = bucket.slice(bucket.indexOf('allowed_mime_types'), bucket.indexOf("where id = 'pairing-media'"));
  ok(!/'video\//.test(allow), 'no video type can be uploaded');
  ok(/share a link/i.test(live), 'and the composer says to share a link instead');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
