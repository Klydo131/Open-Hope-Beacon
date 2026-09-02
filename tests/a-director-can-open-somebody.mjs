// A Director can open a member, and record a guardian's permission.
//
// TWO GAPS, and the second one is the serious one.
//
// 1. THE ROSTER SHOWED A NAME, A ROLE AND A STAGE. Everything the app knows
//    about somebody was collected on sign-up and then only ever shown back to
//    them, so the two questions a person running a church actually asks — "is
//    this a real person I meant to let in?" and "does this pairing make any
//    sense?" — could not be answered from any screen.
//
// 2. THE CONSENT WARNING COULD NEVER BE ANSWERED. The guardian columns, the
//    database functions record_guardian_consent and withdraw_guardian_consent,
//    the Directors' roster of minors and the red "MINOR · consent missing"
//    badge were ALL built. No screen ever called the functions. So every
//    Explorer under eighteen sat permanently at "consent missing" with no way
//    to clear it, which is worse than no warning at all: a flag nobody can
//    answer is one everybody learns to scroll past.
//
//   node tests/a-director-can-open-somebody.mjs
//
// Reads the source; needs no browser and no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// Comments are prose, and the comment ABOVE a rule often has to name the thing
// the rule forbids. Checking the raw file made the "not a personnel file" rule
// fail on the paragraph explaining why it exists.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

const panel = read('components/live/MemberProfile.tsx');
const panelCode = stripComments(panel);
const admin = read('components/live/AdminPage.tsx');
const data = read('lib/live/data.ts');

// ---- Opening somebody ----
ok(/export function MemberProfile/.test(panel), 'there is a profile panel');
ok(/<MemberProfile/.test(admin), 'and the Director’s screen renders it');
ok(/onOpen\(person\.id\)/.test(admin), 'a roster name opens it');
ok((admin.match(/setOpenId\(pairing\.(dm|ds)_id\)/g) ?? []).length === 2,
   'and BOTH names on a pairing row open, not just one');

// The two questions it exists to answer.
ok(/label="Email"/.test(panel), 'it shows the address they were invited at');
ok(/label="Joined"/.test(panel), 'and the day they arrived');
ok(/pairedWith/.test(panel), 'and what it knows about the pairing');
ok(/Same town/.test(panel) && /Same language/.test(panel) && /Both: /.test(panel),
   'naming what the two have in common');
// Two people with nothing written down in common are very often the right
// pairing. A warning here would push Directors to break up working pairs.
ok(/not a problem on its own/i.test(panel),
   'and saying plainly that nothing in common is not a problem');

// ---- A read, not a file ----
// The moment this becomes somewhere to record an opinion, it is a personnel
// file the member cannot see and never agreed to.
ok(!/Add a note|noteFor|assessment/i.test(panelCode),
   'it is a read of what they gave, not somewhere to write about them');
// A blank must be legible as "they declined" rather than "the screen broke".
ok(/Not given/.test(panel), 'an unanswered question says so rather than being blank');

// ---- The consent, which is the part that never existed ----
ok(/live\.recordGuardianConsent\(/.test(panel), 'a Director can record a guardian’s permission');
ok(/live\.withdrawGuardianConsent\(/.test(panel), 'and take it back when a parent changes their mind');
ok(/isMinor\(person\.birthday\)/.test(panel), 'and it is only asked for a minor');
ok(/Parent or guardian’s name/.test(panel), 'the guardian is named');
ok(/Not a member here/.test(panel), 'and linked to their own account when they have one');

// The functions themselves go through the checked RPCs, not a raw update.
ok(/rpc\('record_guardian_consent'/.test(data), 'recording goes through the database function');
ok(/rpc\('withdraw_guardian_consent'/.test(data), 'and so does withdrawing');

// This is the church's note that permission was seen, not the permission.
ok(/not the permission/i.test(panel) || /outside this app/i.test(panel),
   'and the screen says it records permission rather than being it');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
