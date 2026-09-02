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
  // What a visitor who has NOT signed in can touch. Supabase grants the
  // anonymous role everything on every new table and RLS is what takes it back,
  // so a policy written without a TO clause quietly applies to the whole
  // internet. Sweeps every migration rather than a list of tables somebody
  // remembered to add — which is how it caught three the audit had missed.
  ['the signed-out role', 'tests/the-signed-out-role.mjs'],
  // What an Explorer's shelf opens with. The kit is shown to everybody, and it
  // grew into a twenty-item reference shelf that opened with three Bibles and
  // closed with a lesson archive. That is a filing cabinet, not a welcome, so
  // an Explorer now gets a short Jesus-first list -- and this keeps it short.
  ['the Explorer starts with Jesus', 'tests/the-explorer-starts-with-jesus.mjs'],
  // Dead link, or a publisher that dislikes robots? The shelf checker cannot
  // reach the internet from here and runs in CI instead, but the rule it sorts
  // by can be tested anywhere -- and it is the part that was wrong, calling
  // three live sites dead because they answer 403 to a datacentre.
  ['dead is not refused', 'tests/dead-is-not-refused.mjs'],
  // An alert a phone will actually show. Chrome on Android refuses the
  // Notification constructor outright, so the live settings screen said "On"
  // and showed nothing -- on a desktop it worked, which is how it survived.
  ['notifications go through the worker', 'tests/notifications-go-through-the-worker.mjs'],
  // A study could be created, published and deleted but never corrected, so
  // fixing a typo meant deleting the study and losing every handout on it.
  // The database had always allowed the update; only the app was missing.
  ['a study can be corrected', 'tests/a-study-can-be-corrected.mjs'],
  // Live updates, both halves. One table was published for realtime and the
  // rest of the app only changed when somebody pressed refresh; a set naming a
  // table the migration does not publish is a screen subscribing to silence.
  ['the screen keeps up', 'tests/the-screen-keeps-up.mjs'],
  // The library could be added to and shared from and never tidied. The delete
  // policy had always allowed it; only the button was missing, which is a gap
  // that reports itself as nothing at all.
  ['a resource can be taken off the shelf', 'tests/a-resource-can-be-taken-off-the-shelf.mjs'],
  // Evidence on a safeguarding report, and the authorisation around it: the
  // same rule as reports_read, which deliberately keeps it from the reporter
  // too, and no delete on either the row or the stored object.
  ['a report can carry evidence', 'tests/a-report-can-carry-evidence.mjs'],
  // The join screen shown to a room without a live link and without creating
  // anything. The whole value rests on it being incapable of writing, and that
  // is invisible on screen, so it is checked rather than trusted.
  ['the sign-up can be shown', 'tests/the-sign-up-can-be-shown.mjs'],
  // Gender and Status as lists, and a Director pinning a post. Both are small
  // and both destroy data done carelessly: a select holding an unrecognised
  // saved answer silently rewrites it on the next save.
  ['pinned posts and picked answers', 'tests/pinned-posts-and-picked-answers.mjs'],
  // A Director opening a member, and recording a guardian's permission. The
  // consent warning existed with nothing that could ever answer it: the
  // columns, the RPCs and the red badge were built and no screen called them.
  ['a director can open somebody', 'tests/a-director-can-open-somebody.mjs'],
  // An invitation creates the account when it is SENT, so a spent link leaves
  // a real account with no password and no way in. Both ways out are checked:
  // the person's, at the moment their sign-in is refused, and the Director's.
  ['nobody is stranded without a password', 'tests/nobody-is-stranded-without-a-password.mjs'],
  // Two people who were unpaired could never be paired again: the unique
  // constraint had no condition and a disconnect archives rather than deletes,
  // so the archived row held the pair's slot forever. The same migration adds
  // the rule nobody had written down, that an Explorer has one Guide.
  ['a pair can be made again', 'tests/a-pair-can-be-made-again.mjs'],
  // The invitation route that never touches an inbox, for the failure an
  // expiry setting cannot fix: a mail scanner spending the one-time link
  // before the person it was sent to ever taps it.
  ['a link can be handed over', 'tests/a-link-can-be-handed-over.mjs'],
  ['security audit and Guild activity', 'tests/security-audit-and-guild-activity.mjs'],
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
  // Turning what somebody typed into an href is an injection surface, and this
  // field is filled in by a Guide and tapped by the Explorer they walk with.
  ['meeting links', 'tests/meeting-links.mjs'],
  // Whether somebody signing in with things waiting is told, and whether they
  // are buried when they are. Neither is reachable from a browser here: pop-ups
  // need a granted permission, a service worker and a device.
  ['told on arrival', 'tests/notified-on-arrival.mjs'],
  // The most damaging button on a screen must never be the most inviting one.
  ['destructive is discouraged', 'tests/destructive-is-discouraged.mjs'],
  // Whether an Explorer can see that their Guide is a person, and — the half
  // that can bite — whether the query that shows them stays inside the columns
  // the Guide chose to publish.
  ['the Guide is a person', 'tests/the-guide-is-a-person.mjs'],
  // The guild board is the one room where a message reaches a group rather
  // than one person, and some of that group are children. Whether there is a
  // way out of it, and whether it is still not surveilled.
  ['a way out of the guild room', 'tests/a-way-out-of-the-guild-room.mjs'],
  // A room is a folder and a subroom is a folder inside it. Whether every
  // panel in the Office is in exactly one subroom, and whether the links that
  // point into it name subrooms that exist.
  ['rooms and subrooms', 'tests/rooms-and-subrooms.mjs'],
  // Three loading screens existed and the app showed the plainest one. This
  // holds it to the designed one, drawing the real logo.
  ['one loading screen', 'tests/one-loading-screen.mjs'],
  // Who may put something in the library, who reads the record of it
  // afterwards, and who may stop somebody. Each rank watches the rank below it
  // and no further down.
  ['the library is shared and watched', 'tests/the-library-is-shared-and-watched.mjs'],
  // The claims a privacy notice makes have to stay true in the code. Nothing
  // breaks when they drift, which is exactly why they need a check.
  ['data protection', 'tests/data-protection.mjs'],
  // "Send me everything you have about me." The right both laws give, and the
  // one property that keeps answering it safe: it reads as the person asking.
  ['my own data', 'tests/my-own-data.mjs'],
  // A photograph in a conversation is shown rather than named. The sample side
  // had done this correctly for months and the live one had not, which is the
  // parity rule this project keeps writing down and keeps breaking.
  ['a picture looks like a picture', 'tests/a-picture-looks-like-a-picture.mjs'],
  // The documents that get printed and handed to people have to render. A bold
  // phrase that wrapped inside a bullet went out with its asterisks showing.
  ['printed docs render', 'tests/printed-docs-render.mjs'],
  ['themes are readable', 'tests/themes-are-readable.mjs'],
  ['migrations apply cleanly', 'tests/migrations-apply-cleanly.mjs'],
  // The signed-in header, which is the one layout nothing else here can render:
  // it exists only behind a session, and the sandbox these run in cannot reach
  // the backend. It shipped needing ~600px on a 390px phone, which made the
  // whole page scroll sideways — what iOS users saw as an empty strip down the
  // right of every screen.
  ['live header fits a phone', 'tests/live-header-fits.mjs'],
  ['live conversations fit phones and tablets', 'tests/live-conversation-mobile.mjs'],
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
