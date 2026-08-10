// The update reminder, driven end to end in a real browser.
//
// tests/min-build.mjs proves the rule. This proves the app obeys it: that the
// default configuration nags nobody, that a newer build produces a gentle
// reminder, that a build old enough to matter produces an insistent one, that
// "×" is a snooze rather than a dismissal, that the switch in Settings really
// silences it, and that one tap updates in place without an uninstall.
//
// The floor is injected by intercepting /version.json rather than by deploying a
// second build, because an honest server clamps its floor to its own build
// (lib/min-build.mjs) — a single deployment can never legitimately declare
// itself too old. Intercepting is what lets one server stand in for the "older
// phone, newer server" pair this feature exists for.
//
// Service workers are blocked on purpose. The whole point of the /version.json
// check is that it works when the worker is the broken thing, so this exercises
// the path that has no worker at all.
const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;
const OUT =
  process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(
    require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'),
  );

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const FUTURE = new Date(Date.now() + 60_000).toISOString();
const HOUR = 60 * 60 * 1000;

(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 820 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();

  // ---------------------------------------------------------------- server --
  // The real route, unmocked. The field has to be there and it has to be null,
  // because null is the state every deployment ships in.
  const real = await (await ctx.request.get(`${BASE}/version.json`)).json();
  ok('minBuildTime' in real, '/version.json carries a minBuildTime field');
  ok(
    real.minBuildTime === null,
    `the floor is off by default (got ${JSON.stringify(real.minBuildTime)})`,
  );
  ok(typeof real.build === 'string' && real.build.length > 0, '/version.json still carries a build id');

  let floor = null;
  await page.route('**/version.json**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        build: 'ffffffffffff',
        time: FUTURE,
        minBuildTime: floor,
        latestNote: real.latestNote ?? null,
      }),
    }),
  );

  const bannerText = async () => {
    const el = page.locator('.animate-drop').filter({ hasText: /Update ready|Please update/i });
    return (await el.count()) ? ((await el.first().innerText()) || '') : '';
  };

  const nudge = async (attempts = 12) => {
    for (let i = 0; i < attempts; i++) {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(700);
      if (await bannerText()) return true;
    }
    return false;
  };

  const prefs = () =>
    page.evaluate(() => ({
      remind: localStorage.getItem('beacon.update.remind'),
      snooze: Number(localStorage.getItem('beacon.update.snooze') || 0),
    }));

  // --------------------------------------------------- a new build, no floor --
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  ok(await nudge(), 'a newer build produces a reminder with no configuration at all');
  let text = await bannerText();
  console.log('--- gentle ---\n' + text + '\n---');
  ok(/Update ready/i.test(text), 'the ordinary reminder is the gentle one');
  ok(!/Please update/i.test(text), 'no floor means no urgency');

  // "×" is a snooze. It has to actually record one, or it is a dismissal
  // wearing a different name and the reminder never comes back.
  await page.getByRole('button', { name: /Remind me later/i }).first().click();
  await page.waitForTimeout(400);
  ok((await bannerText()) === '', 'tapping × puts the reminder away');
  let p = await prefs();
  const gentleHours = (p.snooze - Date.now()) / HOUR;
  ok(
    gentleHours > 7 && gentleHours < 8.5,
    `× snoozes the gentle reminder for about 8 hours (got ${gentleHours.toFixed(1)}h)`,
  );
  ok(p.remind === null, 'snoozing does not switch reminders off');

  // -------------------------------------------------- a floor above this one --
  floor = FUTURE;
  await page.evaluate(() => localStorage.removeItem('beacon.update.snooze'));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  ok(await nudge(), 'a floor above this bundle still reminds rather than blocking');
  text = await bannerText();
  console.log('--- urgent ---\n' + text + '\n---');
  ok(/Please update/i.test(text), 'the reminder gets more insistent below the floor');
  await page.screenshot({ path: `${OUT}/update-reminder-urgent.png` });

  // Nothing is trapped. Even the urgent one can be put away.
  await page.getByRole('button', { name: /Remind me later/i }).first().click();
  await page.waitForTimeout(400);
  ok((await bannerText()) === '', 'even the urgent reminder can be put away');
  p = await prefs();
  const urgentHours = (p.snooze - Date.now()) / HOUR;
  ok(
    urgentHours > 0.5 && urgentHours < 1.5,
    `the urgent one comes back in about an hour (got ${urgentHours.toFixed(1)}h)`,
  );

  // --------------------------------------------------------- the off switch --
  await page.evaluate(() => {
    localStorage.setItem('beacon.update.remind', 'off');
    localStorage.removeItem('beacon.update.snooze');
  });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  ok(!(await nudge(6)), 'reminders switched off means no reminder, even below the floor');

  // Off is off for the banner and only the banner: Settings still tells the
  // truth, which is the whole reason turning the nag off is safe to offer.
  // Settings sits behind the app shell, so this needs a signed-in session first.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const who = page.getByText(/Maria Santos/i).first();
  if (await who.count()) await who.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(700);
  }
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const panel = await page
    .evaluate(() => {
      const el = [...document.querySelectorAll('h2')].find((e) =>
        /App version/i.test(e.textContent || ''),
      );
      return el?.parentElement?.innerText || '';
    })
    .catch(() => '');
  console.log('--- settings ---\n' + panel + '\n---');
  ok(/Remind me about updates/i.test(panel), 'Settings carries the reminder switch');
  ok(/version/i.test(panel), 'Settings still reports the version with reminders off');

  // ------------------------------------------------ one tap, no uninstalling --
  await page.evaluate(() => {
    localStorage.removeItem('beacon.update.remind');
    localStorage.removeItem('beacon.update.snooze');
  });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  ok(await nudge(), 'switching reminders back on brings it straight back');
  const before = page.url();
  await page.getByRole('button', { name: /^Update$|^Restart$/i }).first().click();
  await page.waitForTimeout(6000);
  const after = page.url();
  ok(after !== before && /fresh=/.test(after), `one tap updates by itself (${after})`);

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await ctx.close();
  await browser.close();
  process.exit(bad === 0 ? 0 : 1);
})();
