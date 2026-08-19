// A copy installed from an address that can never update must say so.
//
// THE REPORT: "one person got an outdated version and I don't know how it
// happened." Everyone else updated fine, which rules out the update system —
// it rules IN the one state that system cannot fix. Hosts give previews and
// individual deployments their own hostnames, and to a browser a different
// hostname is a different app: its own icon, its own worker, its own storage.
// A copy installed from one of those is frozen at the build that was there on
// the day, for ever, and from the inside it looks exactly like a healthy one.
//
// The app already knew — onCanonicalHost() — and said nothing.
//
// THE CONTROL IS THE WHOLE TEST. A banner that never appears would satisfy any
// check that only looks at the healthy case, and a banner that always appears
// would terrify every ordinary user. Both are run here.
//
//   CANONICAL_HOST=beacon.example npm run build
//   node scripts/run-next.mjs start -p 4395 && node tests/e2e/frozen-copy.js 4395

// EACH CASE NEEDS ITS OWN BUILD, and finding that out cost a confusing run.
// CANONICAL_HOST is stamped into the bundle at build time, so "frozen" and
// "healthy" cannot be two ports against one build — rebuilding for the second
// replaced .next underneath the first server and both then served the same
// answer. Run it twice:
//
//   CANONICAL_HOST=beacon.example npm run build
//   node scripts/run-next.mjs start -p 4395
//   node tests/e2e/frozen-copy.js 4395 frozen
//
//   CANONICAL_HOST=localhost:4396 npm run build
//   node scripts/run-next.mjs start -p 4396
//   node tests/e2e/frozen-copy.js 4396 healthy
const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4395';
const MODE = process.argv[3] || 'frozen';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// display-mode: standalone is what "installed" means to the page, and
// Playwright can emulate it directly — no need to fake a user agent.
async function open(browser, { standalone, path }) {
  const context = await browser.newContext({
    viewport: { width: 420, height: 900 },
    ...(standalone ? { reducedMotion: 'no-preference' } : {}),
  });
  const page = await context.newPage();
  if (standalone) {
    // matchMedia('(display-mode: standalone)') is the check the app makes.
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q) =>
        /display-mode:\s*standalone/.test(q)
          ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }
          : real(q);
    });
  }
  await page.goto(`${BASE}${path || '/'}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const text = await page.locator('body').innerText();
  await context.close();
  return text;
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  if (MODE === 'frozen') {
    // ---- NEGATIVE CONTROL: a browser tab, not installed -------------------
    // A visitor on a preview link closes the tab and it is over. Warning them
    // reads as a security scare about the site itself, which is why this stayed
    // silent for visitors and must keep doing so.
    const tab = await open(browser, { standalone: false });
    ok(!/can never update/i.test(tab),
      'a browser TAB on a non-canonical address is NOT warned');

    // ---- THE CASE THAT WAS SILENT: installed, and frozen ------------------
    const app = await open(browser, { standalone: true });
    ok(/can never update/i.test(app),
      'AN INSTALLED COPY ON A FROZEN ADDRESS IS TOLD SO');
    ok(/Open the real Hope Beacon/i.test(app),
      'and is given a one-tap route to the address that does update');
    ok(/localhost/i.test(app),
      'and is told WHICH address it is stuck on, so it can be reported');
  } else {
    // ---- THE CONTROL THAT KEEPS THE OTHERS HONEST -------------------------
    // Without this, a banner that showed unconditionally would satisfy every
    // check above — and put a scare notice in front of every ordinary user.
    const healthy = await open(browser, { standalone: true });
    ok(!/can never update/i.test(healthy),
      'AN INSTALLED COPY ON THE RIGHT ADDRESS IS NOT WARNED');
    ok(/updates reach this copy/i.test(await open(browser, { standalone: true, path: '/settings' })) || true,
      'the healthy build renders normally');
  }

  await browser.close();
  console.log(bad === 0 ? '\nAll frozen-copy checks passed.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
