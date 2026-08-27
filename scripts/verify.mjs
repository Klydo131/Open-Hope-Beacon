// One command that runs every guard, so nobody has to remember the list.
//
//   npm run verify        static guards only — no server, no browser, ~30s
//   npm run verify:all    the above plus every end-to-end walk (~4 min)
//
// Why this exists: the checks were all here already and all run by hand, which
// meant in practice they ran when someone remembered, which meant a stale
// assertion could sit green-looking for weeks. Three of them had drifted so far
// they were asserting the *opposite* of what had been asked for, and the only
// reason anyone noticed was an unrelated investigation.
//
// The e2e half also owns the server lifecycle, because doing that by hand is
// its own source of wrong answers: `next start` exits 1 when a previous
// next-server still holds the port, and a stale server happily answers on the
// old build so the suite passes against code that no longer exists. This picks
// a free port, waits for the build id it just built, and always tears down.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withE2e = process.argv.includes('--all');
const results = [];

// On Windows, `npm` and `npx` are `npm.cmd` / `npx.cmd`, and Node refuses to
// execute a .cmd without a shell — it has done since the CVE-2024-27980
// hardening, so even setups that once worked now fail. Without this, the very
// first thing a Windows contributor runs, `npm run verify`, dies at step one
// with a bare ENOENT that says nothing about the cause.
//
// Gated on win32 rather than always-on: `shell: true` changes argument parsing,
// and there is no reason to take that risk on the platforms where it is not
// needed. Every argument passed here is a bare flag or word with no spaces, so
// there is nothing for the Windows shell to mis-split.
const NEEDS_SHELL = process.platform === 'win32';

function run(label, cmd, args, opts = {}) {
  process.stdout.write(`\n─── ${label} ${'─'.repeat(Math.max(0, 56 - label.length))}\n`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: NEEDS_SHELL && (cmd === 'npm' || cmd === 'npx'),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    ...opts,
  });
  const passed = r.status === 0;
  results.push({ label, passed });
  return passed;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForBuild(port, expected, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/version.json`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const body = await res.json();
        // The build id is the whole point of the wait. A server that answers
        // with a different one is a stale process, and running the suite
        // against it is how you "verify" code that is not deployed.
        if (!expected || body.build === expected) return true;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ---------------------------------------------------------------- static ----

run('typecheck', 'npx', ['tsc', '--noEmit']);
run('build', 'npm', ['run', 'build']);

const staticChecks = [
  ['no secrets', 'tests/no-secrets.js'],
  ['no backend, no pipelines', 'tests/no-backend.js'],
  ['test portability', 'tests/test-portability.mjs'],
  ['brand consistency', 'tests/brand-consistency.mjs'],
  ['media guardrails', 'tests/media-guardrails.js'],
  // Reads the CSP header itself. Every live data call is made from the browser,
  // so a policy that omits the backend origin kills the whole app in the
  // console — where nothing else in this suite is looking.
  ['backend CSP', 'tests/backend-csp.mjs'],
  ['real-time and pairing media', 'tests/realtime-and-media.mjs'],
  ['update floor', 'tests/min-build.mjs'],
  // The auto-update policy, asserted both ways. The browser suite can only
  // prove the half where an update is BLOCKED, and a guard that blocks forever
  // passes that half too — so the decision itself is a pure function and both
  // answers are checked here.
  ['auto-update policy', 'tests/auto-update-policy.mjs'],
  ['analytics over time', 'tests/analytics-trend.mjs'],
  ['security invariants', 'tests/security-invariants.mjs'],
  // What may become a clickable link. Linkifying user text is how an app like
  // this grows an XSS hole, so the protocol allowlist and the anti-phishing
  // rules are checked as rules, not as rendered output.
  ['linkify safety', 'tests/linkify.mjs'],
  ['minor badge', 'tests/minor-badge.mjs'],
  ['email templates', 'tests/email-templates.mjs'],
  ['invite emails', 'tests/invite-emails.mjs'],
  ['iPhone install', 'tests/ios-install.mjs'],
  ['plain words', 'tests/plain-words.mjs'],
  ['accounts and sessions', 'tests/accounts-and-sessions.mjs'],
  ['bulk invite list', 'tests/bulk-invite.mjs'],
  ['stay signed in', 'tests/stay-signed-in.mjs'],
  // Runs the shipped translator over the exact strings that reached a phone:
  // "permission denied for table pairings" and a mime type read out in full.
  // Nothing else here looks at what a failure actually SAYS to a person.
  ['errors are human', 'tests/errors-are-human.mjs'],
  // The two pop-up rules a browser here CANNOT check, because headless
  // Chromium has no collapsing address bar and no home indicator: `vh` versus
  // `dvh`, and the safe area at the bottom of a phone. Both are invisible on a
  // Mac, which is exactly how they shipped.
  ['pop-ups on a phone', 'tests/overlays-on-a-phone.mjs'],
  // Characters that are not emoji have no font promised behind them. The
  // sign-out button was a blank box on every Android phone and perfect on every
  // Apple one, which is why nobody reviewing it ever saw the problem.
  ['icons render everywhere', 'tests/glyphs-render-everywhere.mjs'],
  ['themes are readable', 'tests/themes-are-readable.mjs'],
  ['migrations apply cleanly', 'tests/migrations-apply-cleanly.mjs'],
  // The signed-in header, which is the one layout nothing else here can render:
  // it exists only behind a session, and the sandbox these run in cannot reach
  // the backend. It shipped needing ~600px on a 390px phone, which made the
  // whole page scroll sideways — what iOS users saw as an empty strip down the
  // right of every screen.
  ['live header fits a phone', 'tests/live-header-fits.mjs'],
  ['workflow files', 'tests/workflows.mjs'],
  // Boots `npm run dev` and looks at the page. Everything else in this list
  // tests the PRODUCTION build, which is how a blank `npm run dev` — the very
  // first command the README gives a newcomer — survived with thirty green
  // checks above it.
  ['dev server', 'tests/dev-server.mjs'],
];
for (const [label, file] of staticChecks) {
  if (fs.existsSync(path.join(root, file))) run(label, 'node', [file]);
}

// ------------------------------------------------------------------- e2e ----

if (withE2e) {
  const e2eDir = path.join(root, 'tests/e2e');
  const suites = fs.existsSync(e2eDir)
    ? fs.readdirSync(e2eDir).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort()
    : [];

  if (suites.length === 0) {
    console.log('\n(no e2e suites found)');
  } else {
    const port = await freePort();
    let expected = '';
    try {
      const info = fs.readFileSync(path.join(root, 'lib/build-info.ts'), 'utf8');
      expected = (/BUILD_ID\s*=\s*"([^"]+)"/.exec(info) || [])[1] || '';
    } catch {
      // A missing build id only costs us the staleness check.
    }

    console.log(`\nStarting the app on port ${port}…`);
    const server = spawn(process.execPath, ['scripts/run-next.mjs', 'start', '-p', String(port)], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    });
    let serverLog = '';
    server.stdout.on('data', (d) => (serverLog += d));
    server.stderr.on('data', (d) => (serverLog += d));

    const stop = () => {
      if (!server.killed) server.kill('SIGKILL');
    };
    process.on('exit', stop);
    process.on('SIGINT', () => {
      stop();
      process.exit(130);
    });

    const ready = await waitForBuild(port, expected);
    if (!ready) {
      stop();
      console.log(serverLog.slice(-2000));
      results.push({ label: 'e2e server', passed: false });
      console.log(
        expected
          ? `\nThe server never answered with build ${expected}. ` +
              'Either it failed to start (log above) or another process holds the port.'
          : '\nThe server never became ready (log above).',
      );
    } else {
      console.log(`Serving build ${expected || '(unknown)'}\n`);
      for (const suite of suites) {
        run(`e2e · ${suite.replace(/\.js$/, '')}`, 'node', [
          `tests/e2e/${suite}`,
          String(port),
        ]);
      }
      stop();
    }
  }
}

// ---------------------------------------------------------------- report ----

const failed = results.filter((r) => !r.passed);
console.log(`\n${'═'.repeat(64)}`);
for (const r of results) {
  console.log(`${r.passed ? 'pass' : 'FAIL'}  ${r.label}`);
}
console.log(
  failed.length === 0
    ? `\nAll ${results.length} checks passed.`
    : `\n${failed.length} of ${results.length} checks FAILED: ${failed
        .map((r) => r.label)
        .join(', ')}`,
);
process.exit(failed.length ? 1 : 0);
