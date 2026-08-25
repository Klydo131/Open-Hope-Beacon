// "The Install button does nothing on my iPhone."
//
// THE BUG. Safari has never fired `beforeinstallprompt`, on iOS or on macOS.
// So on every Apple device the header's Install chip has no prompt to hand the
// browser and falls back to a link. That link pointed at `/settings`, and the
// install card lives near the bottom of a long page.
//
// From the user's side: they press a button that says Install, Settings opens,
// and nothing that mentions installing is on screen. There is no error and
// nothing looks broken, so the reasonable conclusion is that the button does
// not work. Android users never saw this, because Chrome gives them a real
// one-tap prompt and they never take this branch.
//
// The fix is an anchor and an opened accordion, which is why this test checks
// where the link goes AND what is on screen after following it. Checking only
// the href would have passed before the accordion was opened, and the person
// would still be looking at a button instead of an answer.
//
//   npm run build && node scripts/run-next.mjs start -p 4390
//   node tests/e2e/apple-install.js 4390
const { chromium, launchOptions, devices } = require('./_playwright');

const PORT = process.argv[2] || '4390';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const browser = await chromium.launch(launchOptions);
  // An iPhone profile, so the app's isIos() sees an iOS user agent and takes
  // the Apple branch. beforeinstallprompt never fires here, exactly as on a
  // real iPhone.
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const who = page.getByText(/Maria Santos/i).first();
  if (await who.count()) await who.click();
  await page.waitForTimeout(1600);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) await consent.first().click().catch(() => {});
  await page.waitForTimeout(800);

  // ---- 1. The chip is a link, and it points AT the card ---------------------
  const chip = page.locator('a[title*="Install"], button[title*="Install"]').first();
  ok(await chip.count() > 0, 'the header offers Install on an iPhone');

  const tag = await chip.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
  const href = await chip.getAttribute('href').catch(() => null);

  // On Apple it MUST be a link. A <button> here would be the dead one: with no
  // deferred prompt to call, its click handler has nothing to do.
  ok(tag === 'a', `it is a link rather than a button with nothing behind it (got <${tag}>)`);
  ok((href || '').includes('/settings#install'),
     `it points at the install card, not the top of Settings (got ${href})`);

  // ---- 2. Following it lands on the card, with the steps already open ------
  await chip.click();
  await page.waitForTimeout(1800);

  ok(page.url().includes('#install'), 'the anchor survives the navigation');

  const card = page.locator('#install');
  ok(await card.count() > 0, 'the card has an id to scroll to');

  // SCOPED TO THE CARD, and that is the point rather than a detail. The first
  // version of this read document.body, and every one of these assertions
  // passed while the bug was present -- because the floating InstallPrompt
  // shows on iOS too and contains the very same words. The test was reading
  // the thing that already worked and reporting on the thing that did not.
  const cardText = (await card.count()) ? await card.innerText() : '';
  ok(/Install Hope Beacon/i.test(cardText), 'the install card is on the page');

  // The actual answer the person pressed the button for. Before the fix they
  // had to find the card and then press "Show me how" to get this.
  ok(/Add to Home Screen/i.test(cardText),
     'the iOS steps are already showing IN THE CARD, without a second button to find');
  ok(/Share/i.test(cardText), 'and they name the Share button');
  ok(!/Show me how/i.test(cardText),
     'the "Show me how" button is not still sitting there unpressed');

  // The card must be in view, not somewhere below the fold. Measured against
  // where the viewport actually is: a card 2000px down reports a sane-looking
  // rect, so the check has to be that it intersects the visible band.
  //
  // HONEST NOTE: this one does not currently discriminate. Settings is short
  // enough on a phone that the card is on screen even without the anchor, so
  // it stayed green while the bug was present. It is kept because the page will
  // grow and the day it does, this is the assertion that notices.
  if (await card.count()) {
    const view = await card.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight };
    });
    ok(view.top < view.h && view.bottom > 0,
       `the card is in view after following the link (top ${view.top}, viewport ${view.h})`);
  }

  // ---- 3. It must not claim a one-tap install it cannot deliver ------------
  const fakeButton = await page.locator('#install button', { hasText: /^Install now$/i }).count();
  ok(fakeButton === 0,
     'no "Install now" button on iOS, where nothing can install programmatically');

  await browser.close();
  console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
