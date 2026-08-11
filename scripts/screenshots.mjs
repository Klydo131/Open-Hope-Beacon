// Capture the README screenshots from the running app.
//
//   npm run build && node scripts/run-next.mjs start -p 4300
//   node scripts/screenshots.mjs 4300
//
// WHY THIS IS A SCRIPT AND NOT A FOLDER OF SAVED IMAGES. A screenshot is a
// claim about what the app looks like today, and it is the one kind of
// documentation that rots without anyone noticing — nothing fails, the picture
// just quietly stops being true. Regenerating is one command, so when a screen
// changes there is no excuse.
//
// Every shot is the real app with its own built-in sample people. Nothing here
// is composed, retouched, or assembled from parts that never appeared together.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'docs/screenshots');
const PORT = process.argv[2] || '4300';
const BASE = `http://localhost:${PORT}`;

const CANDIDATES = [
  'playwright',
  '/opt/node22/lib/node_modules/playwright',
  '/usr/lib/node_modules/playwright',
  '/usr/local/lib/node_modules/playwright',
];
function loadPlaywright() {
  for (const c of CANDIDATES) {
    try {
      return require(c);
    } catch {
      /* next */
    }
  }
  console.error('Playwright is not installed. See tests/e2e/README.md.');
  process.exit(1);
}

const { chromium } = loadPlaywright();
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  (require('node:fs').existsSync('/opt/pw-browsers/chromium')
    ? '/opt/pw-browsers/chromium'
    : undefined);

mkdirSync(OUT, { recursive: true });

const settle = (page, ms = 1500) => page.waitForTimeout(ms);

// Palette-reduce in place with Pillow, if it is around. Optional on purpose:
// somebody regenerating these on a laptop without Python still gets correct
// images, just larger ones.
async function shrink(file) {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(
    'python3',
    [
      '-c',
      'import sys;from PIL import Image;f=sys.argv[1];' +
        'Image.open(f).convert("RGB").quantize(colors=256, method=Image.MEDIANCUT).save(f, optimize=True)',
      file,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) console.warn('  (not shrunk — Pillow unavailable)');
}

async function signIn(page, name) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await settle(page, 1000);
  const who = page.getByText(new RegExp(name, 'i')).first();
  if (await who.count()) await who.click();
  await settle(page, 1600);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await settle(page, 700);
  }
  // The guided walk is genuinely useful and genuinely covers the screen. Close
  // it so the screenshots show the app rather than the tutorial over the app.
  const skip = page.getByRole('button', { name: /Skip|Not now|Close|Later|End tour/i });
  if (await skip.count()) {
    await skip.first().click().catch(() => {});
    await settle(page, 600);
  }
}

// Dismiss the "DEMO · sample data" badge before capturing.
//
// It is a real and deliberate part of the app — an installed app has no address
// bar, so something has to say which window is the demo — but it floats under
// the header and lands on whatever has scrolled beneath it. In a screenshot
// that reads as a broken layout rather than as the transient notice it is. The
// README says in words that these are the built-in sample people, which is the
// same information without the overlap.
async function tidy(page) {
  const badge = page.getByRole('button', { name: /sample data/i });
  if (await badge.count()) {
    await badge.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  // Opening a conversation calls scrollIntoView on the thread's last message,
  // which scrolls the PAGE as well as the thread, so a capture taken straight
  // afterwards starts halfway down and misses the header entirely.
  //
  // Scrolling once is not enough: cards finish laying out after the scroll and
  // push the page back down, so the first attempt lands and then drifts. Insist
  // on it, and confirm rather than assume — a screenshot that quietly starts
  // mid-page is exactly the kind of wrong that ships.
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(350);
    const y = await page.evaluate(() => window.scrollY);
    if (y === 0) break;
  }
  const finalY = await page.evaluate(() => window.scrollY);
  if (finalY !== 0) console.warn(`  ! page would not stay at the top (y=${finalY})`);
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  await tidy(page);
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  // These are flat-colour interface screens, not photographs, so a 256-colour
  // palette is visually indistinguishable and about a third of the bytes. A
  // README that costs 2 MB to clone is a README nobody thanks you for.
  await shrink(file);
  console.log(`  wrote docs/screenshots/${name}.png`);
}

(async () => {
  const browser = await chromium.launch(executablePath ? { executablePath } : {});

  // ---- Desktop -----------------------------------------------------------
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 2, // readable when GitHub scales it down
  });
  const d = await desktop.newPage();

  console.log('desktop:');
  await signIn(d, 'Maria Santos');
  await d.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await settle(d, 1800);
  await shot(d, 'missionary-people');

  const card = d.locator('[data-quest="seeker-card"]').first();
  if (await card.count()) {
    await card.click();
    await settle(d, 1800);
  }
  await shot(d, 'conversation');

  await signIn(d, 'Pastor Ramos');
  await d.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
  await settle(d, 1800);
  await shot(d, 'church-overview');

  await desktop.close();

  // ---- Phone -------------------------------------------------------------
  // 412 wide, because that is what the people using this actually hold, and it
  // is the width every layout test in this repo runs at.
  const phone = await browser.newContext({
    viewport: { width: 412, height: 880 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const p = await phone.newPage();

  console.log('phone:');
  await signIn(p, 'John Reyes');
  await p.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
  await settle(p, 1900);
  await shot(p, 'phone-seeker');

  await signIn(p, 'Maria Santos');
  await p.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await settle(p, 1900);
  await shot(p, 'phone-missionary');

  await phone.close();
  await browser.close();
  console.log('\nDone. Check every image before committing it.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
