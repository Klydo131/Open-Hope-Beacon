// The live Guide and Explorer conversation has a different component from the
// sample-data chat, and it only renders after a Supabase session. The browser
// fixtures deliberately have no live credentials, so this test protects the
// responsive structure directly instead of accidentally testing the login page.

import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const conversation = read('components/live/shared.tsx');
const guide = read('components/live/GuidePages.tsx');
const explorer = read('components/live/ExplorerPage.tsx');

let bad = 0;
const ok = (condition, message) => {
  console.log(`${condition ? 'OK ' : 'BAD'} ${message}`);
  if (!condition) bad++;
};

// At 375–430px wide, the header and relationship context already occupy a
// significant part of the visible screen. A 288px empty thread hid the form
// below it. Keep that comfortable desktop minimum from Tailwind's `sm` break
// point upward, but reserve only 192px before the composer on a phone.
ok(
  /min-h-48[^"]*sm:min-h-72/.test(conversation),
  'the live thread is compact on phones and roomy again from tablet width',
);

// Browser chrome changes the usable height on iOS and Android. The fallback is
// for older browsers; the dynamic viewport value is the one modern phones use.
ok(
  /max-h-\[55vh\][^"]*\[max-height:55dvh\]/.test(conversation),
  'the live thread measures against the visible mobile viewport',
);

ok(
  /data-live-thread[\s\S]{0,700}overflow-y-auto/.test(conversation),
  'message history scrolls inside its own thread instead of stretching the page',
);

// The home indicator sits over the bottom edge of an installed iPhone app.
// Padding the composer, rather than merely moving it, keeps its Send button
// tappable while preserving the card border.
ok(
  /data-live-composer[\s\S]{0,500}safe-area-inset-bottom/.test(conversation),
  'the live composer clears an installed phone’s home indicator',
);

// Both roles must use this shared, protected conversation implementation. A
// one-off phone fix in either screen would leave the other role behind.
ok(
  /import \{ Conversation, Notice, errorText \} from '@\/components\/live\/shared';/.test(guide)
    && /<Conversation/.test(guide),
  'Guide conversations use the shared responsive component',
);
ok(
  /import \{ Conversation, Notice, errorText \} from '@\/components\/live\/shared';/.test(explorer)
    && /<Conversation/.test(explorer),
  'Explorer conversations use the shared responsive component',
);

console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
