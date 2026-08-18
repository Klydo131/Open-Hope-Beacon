// The invited registration asks for three things and will not proceed without
// permission.
//
// The assertion that matters is the disabled button. A consent checkbox that
// does not actually block anything is decoration, and decoration is worse than
// nothing here: it looks like the church asked, and produces a record saying
// they did, while a person who never noticed the box is signed up anyway.
const { chromium, launchOptions } = require('./_playwright');
const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-join-'));
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/p`, {
    ...launchOptions, viewport: { width: 412, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(`${BASE}/join?token=demo-invite-ruth`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  // Dismiss the install banner. It is fixed to the bottom of the viewport and
  // sits over the end of this form, which on a phone is where the optional
  // questions and the join button are. Worth knowing rather than working
  // around silently — see the note in the report.
  const dismiss = page.locator('button[aria-label*="Dismiss" i], button[aria-label*="Close" i]').first();
  if (await dismiss.count()) { await dismiss.click().catch(() => {}); await page.waitForTimeout(400); }

  ok(await page.getByText(/Your name \*/).count() > 0, 'name is marked required');
  ok(await page.getByText(/^Email \*$/).count() > 0, 'email is marked required');

  // Read-only, so an invitation cannot be redirected to a different address by
  // whoever opens the link.
  const email = page.locator('input[readonly]').first();
  ok(await email.count() > 0, 'the email is read-only');
  ok((await email.inputValue()).includes('ruth.bautista'), 'it shows the invited address');

  const box = page.locator('input[type=checkbox]').first();
  ok(await box.count() > 0, 'there is a permission checkbox');
  ok((await box.isChecked()) === false, 'it is NOT ticked by default');
  ok(await page.getByText(/Grace SDA Church/).count() > 0, 'the consent names the church');
  ok(await page.getByText(/withdraw this at any time/i).count() > 0, 'it says the permission can be withdrawn');

  const join = page.getByRole('button', { name: /Join Hope Beacon/i }).first();
  ok(await join.isDisabled(), 'cannot join without ticking permission');
  await box.check();
  await page.waitForTimeout(400);
  ok(!(await join.isDisabled()), 'ticking permission enables joining');

  // Eight boxes is what a form looks like when nobody decided which matter.
  ok(await page.getByText(/Birthday/).count() === 0, 'optional questions are hidden by default');
  await page.getByText(/Tell your Guide a little more/i).first().click();
  await page.waitForTimeout(500);
  ok(await page.getByText(/Birthday/).count() > 0, 'they open when asked for');

  await page.screenshot({ path: `${OUT}/join.png`, fullPage: true });
  console.log(`\nshot: ${OUT}/join.png`);
  await ctx.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
