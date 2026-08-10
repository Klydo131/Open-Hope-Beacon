const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const localMedia = read('lib/localMedia.ts');
const orbit = read('components/OrbitPlayer.tsx');
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
check(
  localMedia.includes('db.transaction(blob ? [META, BLOBS] : [META]'),
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
  orbit.includes('<video') &&
    player.includes('<video') &&
    orbit.includes('video.videoWidth') &&
    player.includes('video.videoWidth'),
  'both Orbit video surfaces use native playback and decoded resolution',
);
check(
  orbit.includes('4K/60 playback depends'),
  'player makes a conditional, truthful 4K/60 claim',
);

console.log(
  failures === 0
    ? '\nRESULT: media boundary intact'
    : `\nRESULT: ${failures} MEDIA VIOLATION(S)`,
);
process.exit(failures === 0 ? 0 : 1);
