// Arranging a time sits beside the conversation, on both people's screens.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. The meetings card is ONE diary shared by two people: the
// same rows, the same policies, either of them free to propose. The Explorer's
// screen has always had it directly beneath the thread. The Guide's screen had
// it under the JOURNEY tab -- which is the one tab on that screen the Explorer
// never sees, because it holds the six stages, the Advance button and the stage
// history, and exists for the Guide to record where somebody has got to.
//
// So a thing the two of them DO TOGETHER was filed inside the folder of things
// the Guide does ABOUT them. The Explorer proposed a time from their chat, and
// the Guide had to leave the conversation and know which tab to open before
// they could see it had been asked. Nothing was broken and nothing errored;
// the card was simply not where either person was standing.
//
// WHAT IS ACTUALLY CHECKED, and why it is a position rather than a word. A
// check for the string "LiveMeetings" somewhere in the file passes just as
// happily with the card in the wrong tab -- that is exactly the state this
// replaces. So the file is cut into its tab sections and the check asks WHICH
// SECTION the card landed in. Move it back under Journey and this goes red.
//
//   node tests/the-diary-sits-with-the-conversation.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const CARD = '<LiveMeetings';

// ---------------------------------------------------------------------------
// 1. THE GUIDE'S CARD IS IN THE TAB THE CONVERSATION IS IN
// ---------------------------------------------------------------------------
//
// The tab keys are read off the source rather than listed here, so renaming a
// tab cannot quietly turn this check into one that always passes.
{
  const src = read('components/live/GuidePages.tsx');

  const sections = [...src.matchAll(/tab === '([a-z]+)'/g)]
    .map((m) => ({ key: m[1], at: m.index }))
    .sort((a, b) => a.at - b.at);

  ok(sections.length >= 2,
     `the Guide's screen is still split into tabs (${sections.length} branches found)`);

  /** Which tab branch a position falls inside. */
  const sectionAt = (pos) => {
    let found = null;
    for (const s of sections) { if (s.at < pos) found = s.key; else break; }
    return found;
  };

  const cardAt = src.indexOf(CARD);
  ok(cardAt !== -1, "the Guide's screen still has the meetings card at all");

  const talkExists = sections.some((s) => s.key === 'talk');
  ok(talkExists, "and still has a 'talk' tab to put it in");

  const where = cardAt === -1 ? null : sectionAt(cardAt);
  ok(where === 'talk',
     `the Guide books a time from the conversation, not from another tab (found in: ${where ?? 'no tab'})`);

  // NAMED SEPARATELY, because "not in journey" is the specific mistake and a
  // future move to a third tab should read as its own failure, not as this one.
  ok(where !== 'journey',
     'and not under Journey, which is the one tab the Explorer never sees');

  // The conversation itself must be in that same tab, or "with the
  // conversation" stops meaning anything.
  const talkStart = sections.find((s) => s.key === 'talk')?.at ?? -1;
  const convoAt = src.indexOf('<Conversation', talkStart);
  ok(convoAt !== -1 && sectionAt(convoAt) === 'talk',
     'and the thread it belongs beside is in that tab too');
}

// ---------------------------------------------------------------------------
// 2. THE EXPLORER'S CARD IS BENEATH THEIR THREAD
// ---------------------------------------------------------------------------
//
// The half that was already right. It is checked so that "both sides match"
// cannot later be satisfied by moving the wrong one.
{
  const src = read('components/live/ExplorerPage.tsx');
  const convoAt = src.indexOf('<Conversation');
  const cardAt = src.indexOf(CARD);

  ok(cardAt !== -1, "the Explorer's screen has the meetings card");
  ok(convoAt !== -1, 'and the conversation above it');
  ok(convoAt !== -1 && cardAt !== -1 && cardAt > convoAt,
     'and the card sits below the thread, where the Explorer is already standing');
}

// ---------------------------------------------------------------------------
// 3. IT IS THE SAME CARD, NOT TWO THAT CAN DISAGREE
// ---------------------------------------------------------------------------
//
// One component and one pairing id on both sides. Two copies of a diary is how
// two people end up certain about different Tuesdays.
{
  const guide = read('components/live/GuidePages.tsx');
  const explorer = read('components/live/ExplorerPage.tsx');
  const IMPORT = /import \{ LiveMeetings \} from '@\/components\/LiveMeetings';/;

  ok(IMPORT.test(guide) && IMPORT.test(explorer),
     'both screens render the one meetings component, so the two lists cannot drift');

  const takesPairing = (src) =>
    /<LiveMeetings\s+pairingId=\{pairing\.id\}/.test(src);
  ok(takesPairing(guide) && takesPairing(explorer),
     'and both point it at the same pairing, which is what makes it one diary');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
