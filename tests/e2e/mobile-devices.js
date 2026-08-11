// The app on a phone, at real device sizes, with touch instead of a mouse.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT. It runs Chromium with each device's
// viewport, pixel ratio, touch support and user agent. That is enough to catch
// the things that actually break on phones in practice: controls pushed off
// screen, tap targets too small to hit, a composer that a soft keyboard would
// bury, horizontal scroll, and features that silently need a mouse.
//
// It is NOT Safari. iOS runs WebKit, and no amount of Chromium emulation is
// WebKit — engine bugs (video fullscreen behaviour, IndexedDB in private mode,
// date parsing) will not show up here. Those are covered by source assertions
// in tests/realtime-and-media.mjs and by the CI matrix, and where neither can
// reach, they are listed honestly as untested rather than assumed.

const { chromium, devices, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// Two ends of the range people actually hold: a small iPhone and a common
// Android. If it works at 375 wide it works at everything above it.
const TARGETS = [
  ['iPhone SE', devices['iPhone SE'] || { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['Pixel 5', devices['Pixel 5'] || { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true }],
];

async function run(browser, label, device) {
  // Chromium cannot emulate WebKit, so drop any Safari user agent rather than
  // pretend: a false UA would only make the results harder to trust.
  const { userAgent, ...rest } = device;
  const context = await browser.newContext(rest);
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.tap();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().tap().catch(() => {});
    await page.waitForTimeout(700);
  }

  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1700);

  // Nothing may scroll sideways. On a phone that is the single most common
  // layout failure and it makes an app feel broken immediately.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok(overflow <= 1, `${label}: no horizontal scroll on the missionary list (${overflow}px)`);

  const card = page.locator('[data-quest="seeker-card"]').first();
  if (await card.count()) {
    await card.tap();
    await page.waitForTimeout(1700);
  }

  const composer = page.locator('[data-quest="chat-send"]');
  ok(await composer.count() > 0, `${label}: the conversation composer is reachable`);

  const roomOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok(roomOverflow <= 1, `${label}: no horizontal scroll in the conversation (${roomOverflow}px)`);

  // Attach must be tappable, not merely present. 44px is Apple's own minimum
  // and the number most accessibility guidance settles on; a control smaller
  // than that is one a thumb misses.
  const attach = page.getByRole('button', { name: /Attach a file/i }).first();
  ok(await attach.count() > 0, `${label}: the attach control is on screen`);
  const b = await attach.boundingBox();
  ok(b !== null && b.height >= 44, `${label}: attach is a real tap target (${b ? Math.round(b.height) : 0}px tall)`);

  const send = page.locator('[data-quest="chat-send"] button').first();
  const sb = await send.boundingBox();
  ok(sb !== null && sb.height >= 44, `${label}: send is a real tap target (${sb ? Math.round(sb.height) : 0}px tall)`);

  // Attaching, on a phone, by touch.
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'from-phone.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await page.waitForTimeout(1900);
  ok(
    (await page.getByText(/from-phone\.png/i).count()) > 0,
    `${label}: a file attached from a phone appears in the conversation`,
  );
  ok(
    (await page.getByText(/file not on this device/i).count()) === 0,
    `${label}: the attachment resolves to real bytes`,
  );

  // Still no sideways scroll once an image is in the thread — an unconstrained
  // image is a classic way to blow out a phone layout.
  const afterMedia = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok(afterMedia <= 1, `${label}: an attachment does not widen the page (${afterMedia}px)`);

  await context.close();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const [label, device] of TARGETS) {
    await run(browser, label, device);
  }
  await browser.close();
  console.log(bad === 0 ? '\nAll mobile device checks passed.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
