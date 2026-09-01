// Photograph the app the way a member actually meets it, for the illustrated guide.
//
// THREE SHOT SCRIPTS, AND THEY ARE NOT INTERCHANGEABLE.
//
//   scripts/screenshots.mjs      the PRODUCT, for the README: "what is this?"
//   scripts/guide-shots.mjs      the SETUP JOURNEY: "am I in the right place?"
//   this one                     the MEMBER'S JOURNEY: "how do I use it?"
//
// Mixing them would mean a README refresh silently rewrote the member's guide.
//
// PHONE-SHAPED ON PURPOSE. Every one of these is taken at 390x844, because that
// is what the congregation is holding. A guide illustrated with desktop windows
// teaches people to look for things where they are not. The two Director screens
// are the exception and say so: approving members is desk work.
//
//   npm run build && node scripts/run-next.mjs start -p 4310
//   node scripts/walkthrough-shots.mjs 4310
//
// Every shot is the real app running on its own sample people. Nothing is
// composed or retouched. A screenshot is the one kind of documentation that
// rots with nothing failing, so rerun this whenever a screen changes.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'docs/screenshots/walkthrough');
const PORT = process.argv[2] || '4310';
const BASE = `http://localhost:${PORT}`;

const { chromium } = require('playwright');
mkdirSync(OUT, { recursive: true });

const settle = (page, ms = 1300) => page.waitForTimeout(ms);

/** Sign in as one of the sample people and clear anything that covers the screen. */
async function signIn(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await settle(page, 1200);
  const pick = page.getByText(who).first();
  if (await pick.count()) await pick.click();
  await settle(page, 1600);
  for (const label of [/I understand|Continue|Got it|Agree/i, /Skip|Not now|Close|Later|End tour/i]) {
    const b = page.getByRole('button', { name: label });
    if (await b.count()) { await b.first().click().catch(() => {}); await settle(page, 600); }
  }
}

/** Choose a room or subroom by its visible label. */
async function room(page, label) {
  const tab = page.getByRole('tab', { name: label }).first();
  if (await tab.count()) { await tab.click().catch(() => {}); await settle(page, 900); }
}

const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 900 };

const SHOTS = [
  { file: '01-front-door.png', what: 'The front door', size: PHONE,
    go: async (p) => { await p.goto(`${BASE}/?tutorial=0`, { waitUntil: 'networkidle' }); await settle(p, 1600); } },

  { file: '02-who-are-you.png', what: 'Choosing who you are', size: PHONE,
    go: async (p) => { await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await settle(p, 1500); } },

  { file: '03-explorer-guide.png', what: 'An Explorer: My Guide', size: PHONE,
    go: async (p) => { await signIn(p, /John/i); await p.goto(`${BASE}/ds`, { waitUntil: 'networkidle' }); await settle(p, 1600); } },

  { file: '04-explorer-study.png', what: 'An Explorer: Study', size: PHONE,
    go: async (p) => { await signIn(p, /John/i); await p.goto(`${BASE}/ds`, { waitUntil: 'networkidle' }); await settle(p); await room(p, /Study/i); } },

  { file: '05-explorer-church.png', what: 'An Explorer: Church', size: PHONE,
    go: async (p) => { await signIn(p, /John/i); await p.goto(`${BASE}/ds`, { waitUntil: 'networkidle' }); await settle(p); await room(p, /Church/i); } },

  { file: '06-explorer-prayer.png', what: 'An Explorer: Prayer', size: PHONE,
    go: async (p) => { await signIn(p, /John/i); await p.goto(`${BASE}/ds`, { waitUntil: 'networkidle' }); await settle(p); await room(p, /Prayer/i); } },

  { file: '07-explorer-library.png', what: "An Explorer's shelf: eight resources, Jesus first", size: PHONE,
    go: async (p) => {
      await signIn(p, /John/i);
      await p.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
      await settle(p, 1700);
      // Past the welcome card to the shelf itself. A picture of the heading
      // above an empty fold teaches nothing about what is on the shelf.
      const first = p.getByText(/The Bible, free/i).first();
      if (await first.count()) await first.scrollIntoViewIfNeeded().catch(() => {});
      await settle(p, 900);
    } },

  { file: '08-guide-desk.png', what: "A Guide's desk", size: PHONE,
    go: async (p) => { await signIn(p, /Maria Santos/i); await p.goto(`${BASE}/dm`, { waitUntil: 'networkidle' }); await settle(p, 1600); } },

  { file: '09-conversation.png', what: 'A conversation, private between two people', size: PHONE,
    go: async (p) => { await signIn(p, /Maria Santos/i); await p.goto(`${BASE}/dm/pair-john`, { waitUntil: 'networkidle' }); await settle(p, 1700); } },

  { file: '10-journey.png', what: 'Moving somebody along their journey', size: PHONE,
    go: async (p) => { await signIn(p, /Maria Santos/i); await p.goto(`${BASE}/dm/pair-john`, { waitUntil: 'networkidle' }); await settle(p); await room(p, /Journey/i); } },

  { file: '11-office.png', what: 'The Office, and its subrooms', size: PHONE,
    go: async (p) => { await signIn(p, /Maria Santos/i); await p.goto(`${BASE}/office`, { waitUntil: 'networkidle' }); await settle(p, 1600); } },

  { file: '12-tutorial.png', what: 'The guided walk, pointing at the next thing to tap', size: PHONE,
    go: async (p) => {
      await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await settle(p, 1200);
      const chip = p.locator('[data-quest-track="ds"]').first();
      if (await chip.count()) await chip.click();
      await settle(p, 2200);
      const c = p.getByRole('button', { name: /I understand|Continue|Got it/i });
      if (await c.count()) { await c.first().click().catch(() => {}); await settle(p, 900); }
    } },

  { file: '13-settings.png', what: 'Settings, where installing lives', size: PHONE,
    go: async (p) => { await signIn(p, /John/i); await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle' }); await settle(p, 1600); } },

  // Desk work, and photographed as such.
  { file: '14-approvals.png', what: 'A Director: who is waiting to be let in', size: DESK,
    go: async (p) => { await signIn(p, /Pastor Ramos/i); await p.goto(`${BASE}/admin`, { waitUntil: 'networkidle' }); await settle(p, 1700); } },

  { file: '15-church.png', what: 'The church home: notices, prayer wall, the numbers', size: DESK,
    go: async (p) => { await signIn(p, /Pastor Ramos/i); await p.goto(`${BASE}/church`, { waitUntil: 'networkidle' }); await settle(p, 1700); } },
];

const executablePath = (() => {
  const fs = require('node:fs');
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const rootDir = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!rootDir || !fs.existsSync(rootDir)) return undefined;
  for (const entry of fs.readdirSync(rootDir)) {
    if (!entry.startsWith('chromium-')) continue;
    for (const rel of [
      ['chrome-linux', 'chrome'],
      ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
    ]) {
      const candidate = join(rootDir, entry, ...rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
})();

const browser = await chromium.launch(executablePath ? { executablePath } : {});
let failed = 0;
for (const shot of SHOTS) {
  const context = await browser.newContext({ viewport: shot.size, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await shot.go(page);
    await page.screenshot({ path: join(OUT, shot.file) });
    console.log(`  ${shot.file}  ${shot.what}`);
  } catch (cause) {
    failed += 1;
    console.log(`  SKIPPED ${shot.file}: ${String(cause?.message ?? cause).split('\n')[0]}`);
  }
  await context.close();
}
await browser.close();

// A missing picture is a hole in the guide, so say so loudly rather than
// leaving somebody to find a broken image in a printed PDF.
console.log(failed ? `\n${failed} shot(s) did not capture.` : `\nAll ${SHOTS.length} shots captured.`);
process.exit(failed ? 1 : 0);
