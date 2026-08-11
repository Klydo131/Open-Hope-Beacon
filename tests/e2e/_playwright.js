// Find Playwright wherever it happens to live.
//
// One suite had `require('/opt/node22/lib/node_modules/playwright')` committed
// into it — an absolute path to one particular sandbox. It worked there and
// nowhere else, which is the worst kind of test bug: it does not fail, it just
// stops being portable, and the failure surfaces later as "the tests are broken
// on my machine" or a red CI job nobody can reproduce locally.
//
// Playwright is deliberately NOT a dependency of this project. It is a ~300 MB
// install with its own browser downloads, and the app does not use it at
// runtime — only these end-to-end walks do. So it may be a local devDependency,
// a global install, or absent entirely, and this resolves all three honestly.

const path = require('node:path');
const fs = require('node:fs');

const CANDIDATES = [
  // A normal local install, if someone has run `npm i -D playwright`.
  'playwright',
  // Common global locations, in the order they are likely to appear.
  '/opt/node22/lib/node_modules/playwright',
  '/usr/lib/node_modules/playwright',
  '/usr/local/lib/node_modules/playwright',
];

function loadPlaywright() {
  for (const candidate of CANDIDATES) {
    try {
      return require(candidate);
    } catch {
      // Try the next one.
    }
  }
  // A global install that npm knows about but node's resolver does not.
  try {
    const { execFileSync } = require('node:child_process');
    // shell on Windows: npm is npm.cmd there and execFile cannot run it.
    const prefix = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }).trim();
    const candidate = path.join(prefix, 'playwright');
    if (fs.existsSync(candidate)) return require(candidate);
  } catch {
    // Fall through to the explanation below.
  }

  console.error(
    'Playwright is not installed.\n\n' +
      'These end-to-end walks drive a real browser, so they need it:\n' +
      '  npm i -D playwright        (local, recommended)\n' +
      '  npm i -g playwright        (global)\n\n' +
      'The static guards do not need a browser — `npm run verify` runs those\n' +
      'on their own and is what CI relies on.',
  );
  process.exit(2);
}

// Chromium is the only browser these suites use. An explicit executablePath is
// honoured when the environment provides one (this sandbox pre-installs the
// browser separately from the library), and otherwise Playwright's own
// discovery is left alone.
const playwright = loadPlaywright();

const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

module.exports = {
  chromium: playwright.chromium,
  playwright,
  // Playwright's device descriptors (viewport, pixel ratio, touch, user agent),
  // so a suite can say "iPhone SE" instead of hand-copying numbers that then
  // quietly drift away from the real device.
  devices: playwright.devices,
  // Suites pass this into launch()/launchPersistentContext() so the browser
  // lookup is decided in one place rather than repeated in every file.
  launchOptions: EXECUTABLE ? { executablePath: EXECUTABLE } : {},
};
