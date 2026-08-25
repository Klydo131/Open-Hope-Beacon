const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const localMedia = read('lib/localMedia.ts');
const player = read('components/MediaPlayer.tsx');

let failures = 0;
function check(condition, message) {
  console.log(`${condition ? 'OK  ' : 'BAD '} ${message}`);
  if (!condition) failures++;
}

const dependencyNames = Object.keys({
  ...pkg.dependencies,
  ...pkg.devDependencies,
}).join(' ').toLowerCase();

check(
  !/tkvideoplayer|pyav|pillow|ffmpeg/.test(dependencyNames),
  'video playback adds no desktop/transcoding dependency',
);
check(
  !/\bfetch\s*\(/.test(localMedia),
  'on-device media storage makes no network request',
);
// THE PROPERTY, NOT THE SPELLING. This used to match the literal text
// `db.transaction(blob ? [META, BLOBS] : [META]`, so renaming a local variable
// read as losing atomicity. What matters is that one transaction covers both
// stores, so a row can never exist without its bytes.
const putBody = (() => {
  const at = localMedia.indexOf('export async function putMedia');
  return at === -1 ? '' : localMedia.slice(at, localMedia.indexOf('\nexport ', at + 10));
})();
check(putBody.length > 0, 'putMedia is where this check can see it');
check(
  (putBody.match(/db\.transaction\(/g) || []).length === 1,
  'putMedia opens exactly one transaction',
);
check(
  /db\.transaction\([^)]*META[^)]*BLOBS[^)]*\]/.test(putBody.replace(/\s+/g, ' ')),
  'that transaction spans both the metadata and the bytes',
);
check(
  /objectStore\(META\)\.put/.test(putBody) && /objectStore\(BLOBS\)\.put/.test(putBody),
  'media metadata and bytes use one atomic transaction',
);
check(
  localMedia.includes('db.transaction([META, BLOBS], \'readwrite\')'),
  'media deletion removes metadata and bytes atomically',
);
check(
  localMedia.includes('navigator.storage.estimate()') &&
    localMedia.includes('inspectPlayableMedia'),
  'uploads preflight storage and playback support',
);
check(
  player.includes('<video') && player.includes('video.videoWidth'),
  'video uses native playback and reports the decoded resolution',
);
// The claim moved with the player it described. It used to live in the media
// page's own prose; that section went when the private player was removed from
// this repository, so the only place Beacon still promises anything about 4K is
// the release notes — and that is where the promise now has to stay honest.
check(
  read('lib/release-notes.ts').includes('depends on the file format, browser, device and display'),
  'the 4K/60 claim stays conditional wherever it is made',
);

console.log(
  failures === 0
    ? '\nRESULT: media boundary intact'
    : `\nRESULT: ${failures} MEDIA VIOLATION(S)`,
);
process.exit(failures === 0 ? 0 : 1);
