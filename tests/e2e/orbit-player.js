const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;
// Screenshots and browser profiles go somewhere writable that is not the
// repo. Overridable so CI can collect them as artifacts.
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'));
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// A tiny real WAV so the browser has genuine audio bytes to store and decode.
function wav(seconds = 1, freq = 440) {
  const rate = 8000, n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 8000), 44 + i * 2);
  }
  return buf;
}

(async () => {
  const b = await chromium.launch(launchOptions);
  const page = await b.newPage({ viewport: { width: 1400, height: 1000 } });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.click();
  await page.waitForTimeout(1400);
  const c = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await c.count()) { await c.first().click().catch(() => {}); await page.waitForTimeout(600); }

  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  // The rail player is deliberately unbranded — "take out the orbit inside the
  // player" — so looking for the word ORBIT here asserts the opposite of what
  // was asked for. Assert the player itself is there; the "Powered by The Orbit"
  // credit is checked on the Library page, which is where it lives.
  ok(await page.getByRole('button', { name: /Show player options/i }).count() > 0,
     'Orbit player is present in the room');

  // Expand the panel (the ⋯ toggle).
  const toggle = page.getByRole('button', { name: /Show player options/i }).first();
  ok(await toggle.count() > 0, 'panel has an options toggle');
  await toggle.click();
  await page.waitForTimeout(900);

  for (const t of ['Vault', 'Playlists', 'Ambience']) {
    ok(await page.getByRole('button', { name: new RegExp(`^${t}$`) }).count() > 0, `has a ${t} shelf`);
  }

  // --- Upload two real audio files ---
  const chooser = page.locator('input[type="file"][accept*="audio"]').first();
  await chooser.setInputFiles([
    { name: 'Morning Hymn.wav', mimeType: 'audio/wav', buffer: wav(1, 440) },
    { name: 'Evening Psalm.wav', mimeType: 'audio/wav', buffer: wav(1, 330) },
  ]);
  await page.waitForTimeout(2500);
  const vaultText = await page.locator('aside, [class*="compact-ui"]').last().innerText().catch(() => '');
  const bodyText = await page.locator('body').innerText();
  ok(/Morning Hymn/.test(bodyText), 'uploaded track appears in the vault');
  ok(/Evening Psalm/.test(bodyText), 'second uploaded track appears');
  await page.screenshot({ path: `${OUT}/orbit-vault.png` });

  // --- Search filters the vault ---
  const search = page.getByPlaceholder(/Search your media/i).first();
  ok(await search.count() > 0, 'vault has a search box');
  await search.fill('Morning');
  await page.waitForTimeout(700);
  const filtered = await page.locator('body').innerText();
  ok(/Morning Hymn/.test(filtered), 'search keeps the matching track');
  ok(!/Evening Psalm/.test(filtered), 'search hides the non-matching track');
  await search.fill('');
  await page.waitForTimeout(600);

  // --- Play a track ---
  await page.getByRole('button', { name: /Play Morning Hymn/i }).first().click();
  await page.waitForTimeout(1600);
  // One <video> element carries both audio and video. An <audio> tag cannot
  // show a picture, which is what "this doesn't feel like a media player" was
  // about — so querying for 'audio' here now finds nothing by design.
  const playing = await page.evaluate(() => {
    const a = document.querySelector('video');
    return a ? { src: !!a.src, paused: a.paused } : null;
  });
  ok(playing && playing.src, 'media element is loaded with the chosen track');
  ok(playing && !playing.paused, 'the track is actually playing');

  // --- Create a playlist, add a track, open it ---
  await page.getByRole('button', { name: /^Playlists$/ }).click();
  await page.waitForTimeout(700);
  await page.getByPlaceholder(/New playlist/i).fill('Sabbath Set');
  await page.getByRole('button', { name: /^Add$/ }).click();
  await page.waitForTimeout(900);
  ok(/Sabbath Set/.test(await page.locator('body').innerText()), 'playlist created');

  await page.getByRole('button', { name: /^Vault$/ }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Add Morning Hymn to a playlist/i }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Sabbath Set$/ }).first().click();
  await page.waitForTimeout(900);

  await page.getByRole('button', { name: /^Playlists$/ }).click();
  await page.waitForTimeout(700);
  const listText = await page.locator('body').innerText();
  ok(/Sabbath Set/.test(listText) && /· 1/.test(listText), 'playlist shows a track count of 1');
  await page.screenshot({ path: `${OUT}/orbit-playlists.png` });

  // --- Persistence across reload (vault is IndexedDB, playlists localStorage) ---
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /Show player options/i }).first().click();
  await page.waitForTimeout(900);
  const afterReload = await page.locator('body').innerText();
  ok(/Morning Hymn/.test(afterReload), 'uploads survive a reload');
  await page.getByRole('button', { name: /^Playlists$/ }).click();
  await page.waitForTimeout(700);
  ok(/Sabbath Set/.test(await page.locator('body').innerText()), 'playlists survive a reload');

  // --- Delete removes it from the vault AND from the playlist ---
  await page.getByRole('button', { name: /^Vault$/ }).click();
  await page.waitForTimeout(700);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Delete Morning Hymn/i }).first().click();
  await page.waitForTimeout(1800);
  const afterDelete = await page.locator('body').innerText();
  ok(!/Morning Hymn/.test(afterDelete), 'deleted track is gone from the vault');
  await page.getByRole('button', { name: /^Playlists$/ }).click();
  await page.waitForTimeout(800);
  const plAfter = await page.locator('body').innerText();
  ok(/Sabbath Set/.test(plAfter) && /· 0/.test(plAfter), 'deleting also removed it from the playlist');

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await b.close();
  process.exit(bad ? 1 : 0);
})();
