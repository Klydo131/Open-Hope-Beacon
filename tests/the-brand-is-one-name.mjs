// The app has one name, and the old one is gone.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. lib/brand.ts opened with "change these lines and nothing
// else", said nothing hard-codes the name, and named a test that would fail if
// something started to. All three were false.
//
// tests/brand-consistency.mjs -- the test it named -- only ever compared the
// LOGO DRAWING between its copies. It never looked at the name once. So the
// promise was never enforced, fifty-one hard-coded occurrences accumulated
// across twenty-three screens, and the rename away from the app's first name
// had to visit eighty-four files instead of one.
//
// THE TWO STORAGE KEYS ARE THE SHARP EDGE, and the reason this file matters
// more than a tidy-up. `hope-beacon.feedback.local` and
// `hope-beacon:library-favorites:v1` are localStorage ADDRESSES, not labels.
// Renaming one does not move what is stored there: it points the browser at a
// drawer that has never been written to, and somebody's unsent feedback or
// saved favourites are gone, with no error and no way back. They keep the old
// spelling forever, and the checks below make removing them a red build rather
// than a quiet loss on a stranger's phone.
//
//   node tests/the-brand-is-one-name.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

/** Every tracked text file, which is the only surface a rename has to cover. */
function tracked() {
  const skipDir = new Set(['node_modules', '.next', '.next-dev', '.git', 'screenshots']);
  const skipExt = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.ico', '.webp', '.zip',
                           '.woff', '.woff2', '.docx']);
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter((f) => !f.split('/').some((part) => skipDir.has(part)))
    .filter((f) => !skipExt.has(path.extname(f).toLowerCase()));
}

// The two localStorage addresses that must never be renamed.
const KEYS = ['hope-beacon.feedback.local', 'hope-beacon:library-favorites'];

// ---------------------------------------------------------------------------
// 1. THE NAME IS DEFINED IN ONE PLACE
// ---------------------------------------------------------------------------
{
  const brand = read('lib/brand.ts');
  const full = brand.match(/export const APP_NAME = '([^']+)'/)?.[1];
  const short = brand.match(/export const APP_SHORT_NAME = '([^']+)'/)?.[1];
  ok(!!full, `lib/brand.ts defines the full name (${full ?? 'MISSING'})`);
  ok(!!short, `and the short one (${short ?? 'MISSING'})`);
  ok(!!full && !!short && full.includes(short),
     'and the short name is part of the full one, so they cannot drift apart');
}

// ---------------------------------------------------------------------------
// 2. THE PREVIOUS NAME IS GONE FROM EVERY TRACKED FILE
// ---------------------------------------------------------------------------
//
// Except inside the two storage keys, which are addresses. A file is allowed to
// contain "hope-beacon" only as part of one of those.
{
  const stragglers = [];
  for (const file of tracked()) {
    let text;
    try { text = read(file); } catch { continue; }
    let stripped = text;
    for (const key of KEYS) stripped = stripped.split(key).join('');
    if (/Open Hope Beacon|Hope Beacon|open-hope-beacon|hope-beacon/i.test(stripped)) {
      stragglers.push(file);
    }
  }
  ok(stragglers.length === 0,
     `the previous name appears in no tracked file${
       stragglers.length ? `\n        still there: ${stragglers.join('\n                     ')}` : ''}`);
}

// ---------------------------------------------------------------------------
// 3. THE TWO STORAGE KEYS SURVIVED
// ---------------------------------------------------------------------------
//
// The inverse of check 2, and the more important half. A rename that swept
// these up would pass every other check in this file while silently emptying a
// drawer on somebody's phone.
{
  ok(read('lib/backend/feedback.ts').includes("'hope-beacon.feedback.local'"),
     'unsent feedback still lives at the address it was written to');
  ok(read('app/library/page.tsx').includes("'hope-beacon:library-favorites:v1'"),
     'and saved favourites still live at theirs');

  // NAMED, NOT ALLUDED TO. The first version of this check looked for the words
  // "storage" or "address" anywhere in the file, which survived deleting the
  // warning itself because those words appear elsewhere in the same comment. A
  // renamer needs the two exact strings in front of them, so that is what is
  // checked.
  const brand = read('lib/brand.ts');
  for (const key of KEYS) {
    ok(brand.includes(key),
       `and lib/brand.ts names ${key} as an address a rename must not touch`);
  }
}

// ---------------------------------------------------------------------------
// 4. THE HARD-CODED SURFACE IS PINNED
// ---------------------------------------------------------------------------
//
// The honest state: the name IS hard-coded in the screens, fifty-one times.
// Making that genuinely one constant is a separate change, mostly inside
// sentences rather than labels. What this check does is stop the number growing
// quietly again -- which is exactly how it got to fifty-one behind a promise
// nobody was testing.
//
// If you add a screen that names the app, import APP_NAME instead. If you have
// deliberately reduced the count, lower the number here.
{
  const brand = read('lib/brand.ts');
  const full = brand.match(/export const APP_NAME = '([^']+)'/)?.[1] ?? '';
  const short = brand.match(/export const APP_SHORT_NAME = '([^']+)'/)?.[1] ?? '';

  let hard = 0;
  for (const file of tracked()) {
    if (!/^(components|app)\/.*\.tsx$/.test(file)) continue;
    const text = read(file);
    hard += (text.match(new RegExp(full, 'g')) ?? []).length;
    // Count the short name only where it is not part of the full one.
    hard += (text.split(full).join('').match(new RegExp(short, 'g')) ?? []).length;
  }

  const PINNED = 51;
  ok(hard <= PINNED,
     `the screens hard-code the name ${hard} time(s), no more than the ${PINNED} on record`);
  if (hard < PINNED) {
    console.log(`      (down from ${PINNED} — lower PINNED in this file to lock the gain in)`);
  }

  ok(/APP_NAME/.test(read('app/manifest.ts')) || /brand/.test(read('app/manifest.ts')),
     'and the installed app takes its name from the constant, not from a copy');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
