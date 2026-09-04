// The password an invitation e-mails somebody.
//
// WHY THE INVITATION CARRIES ONE AT ALL. It used to carry a one-time link, and
// a one-time link is fragile in ways nobody invited to a church app should have
// to understand. It expires. It is spent by the first thing that opens it,
// which on many mail systems is a scanner and not a person. It works once, so a
// second tap fails. Twenty-three people were once stuck at the same moment,
// each holding an account with no password and a link already used.
//
// WHAT IT HAS TO BE. Readable off a phone screen, typable on a phone keyboard
// by somebody in their seventies, and sayable down a telephone to a person who
// is stuck. That rules out `xK7#pQ2v` on all three counts.
//
//   node tests/a-first-password.mjs
//
// Runs the real generator. Needs no browser and no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORDS, entropyBits, firstPassword } from '../supabase/functions/invite/password.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// ---------------------------------------------------------------------------
// 1. The word list
// ---------------------------------------------------------------------------
ok(WORDS.length >= 200, `there are enough words to draw from (${WORDS.length})`);
ok(new Set(WORDS).size === WORDS.length, 'and none of them is in the list twice');
{
  const wrong = WORDS.filter((w) => !/^[a-z]{3,8}$/.test(w));
  ok(wrong.length === 0,
     wrong.length
       ? `every word is 3-8 plain lowercase letters (bad: ${wrong.join(', ')})`
       : 'every word is 3-8 plain lowercase letters, so there is nothing to spell wrong');
}

// ---------------------------------------------------------------------------
// 2. IT TERMINATES
// ---------------------------------------------------------------------------
//
// THE BUG THIS PINS, WHICH WAS REAL AND WAS MINE. The picker drew ONE random
// byte and rejected values that would bias the choice. One byte cannot address
// more than 256 things, and the list shipped with 272 words: the rejection
// ceiling computed to zero, nothing was ever accepted, and `firstPassword()`
// LOOPED FOREVER. Not a weak password -- no password at all, and an edge
// function that never answers the Director who pressed Send.
//
// It was caught by running the thing rather than reading it, which is the only
// reason it is not in the repository. So this test runs it, many times, and any
// regression hangs here instead of in production.
{
  const started = Date.now();
  const seen = new Set();
  const N = 3000;
  for (let i = 0; i < N; i += 1) seen.add(firstPassword());
  const ms = Date.now() - started;
  ok(true, `${N} passwords generated in ${ms}ms without hanging`);
  // Duplicates in three thousand draws would mean the randomness is not.
  ok(seen.size === N, `and all ${N} were different`);
}

// ---------------------------------------------------------------------------
// 3. The shape, on real output
// ---------------------------------------------------------------------------
{
  const sample = Array.from({ length: 2000 }, () => firstPassword());

  // The app refuses anything under ten characters, in lib/live/data.ts. A
  // generator that can emit a nine-character password would create accounts
  // whose own password the app would not accept as a replacement.
  const shortest = Math.min(...sample.map((p) => p.length));
  ok(shortest >= 10, `never shorter than the app's own 10-character rule (${shortest})`);

  const wrong = sample.filter((p) => !/^[a-z]+(-[a-z]+)+-[1-9][0-9]*$/.test(p));
  ok(wrong.length === 0,
     wrong.length ? `every password is words-then-digits (bad: ${wrong[0]})` : 'words, hyphens, then digits');

  // ALL LOWERCASE. Every capital is a shift key on a phone and a place to get
  // it wrong, and there is nothing here that needs the extra alphabet.
  ok(!sample.some((p) => /[A-Z]/.test(p)), 'nothing needs the shift key');
  // No character a person has to be told the name of.
  ok(!sample.some((p) => /[^a-z0-9-]/.test(p)), 'and no symbol anybody has to describe out loud');

  // A NUMBER THAT NEVER STARTS WITH A ZERO. `047` gets typed as `47`, and the
  // person then cannot sign in and has no idea why.
  const leadingZero = sample.filter((p) => /-0\d*$/.test(p));
  ok(leadingZero.length === 0, 'the number never starts with a zero, which people drop when typing');

  // Three distinct words, so nothing reads `coral-coral-cedar`.
  const repeated = sample.filter((p) => {
    const parts = p.split('-').slice(0, -1);
    return new Set(parts).size !== parts.length;
  });
  ok(repeated.length === 0, 'and no word appears twice in the same password');
}

// ---------------------------------------------------------------------------
// 4. How hard it is to guess, computed rather than asserted
// ---------------------------------------------------------------------------
//
// The number is printed so shrinking the word list can never quietly weaken
// every invitation the church sends. It is a TEMPORARY credential on a
// rate-limited online sign-in, not a secret meant to survive an offline attack
// -- the email says to change it and the app asks again.
{
  const bits = entropyBits();
  ok(bits >= 30, `roughly ${bits.toFixed(1)} bits to guess, which is the floor under the first few days`);
}

// ---------------------------------------------------------------------------
// 5. The draw is even, and sizes itself
// ---------------------------------------------------------------------------
{
  const src = read('supabase/functions/invite/password.ts');
  ok(/crypto\.getRandomValues/.test(src), 'the randomness is the cryptographic kind');
  ok(!/Math\.random/.test(src), 'and not Math.random, which is predictable');
  // Rejection rather than a remainder: `byte % 200` makes the first 56 words
  // more likely than the rest.
  ok(/ceiling/.test(src) && /% limit/.test(src), 'out-of-range draws are rejected rather than folded');
  // The fix for the hang above: the draw widens instead of assuming one byte.
  ok(/limit > 256/.test(src), 'and the draw widens for a list of more than 256, instead of hanging');

  // A CHEAP EVENNESS CHECK. Not a statistical proof -- it is here to catch a
  // picker that always returns the same index, or one that never reaches the
  // end of the list, which is what a modulo bug actually looks like.
  const first = new Map();
  for (let i = 0; i < 6000; i += 1) {
    const w = firstPassword().split('-')[0];
    first.set(w, (first.get(w) ?? 0) + 1);
  }
  ok(first.size > WORDS.length * 0.7,
     `the whole list is reachable (${first.size} of ${WORDS.length} words seen as the first word)`);
  const most = Math.max(...first.values());
  ok(most < 6000 / WORDS.length * 6,
     `and no single word dominates (most common appeared ${most} times in 6000)`);
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
