// The promise this project makes, checked rather than asserted in a README.
//
// Open Hope Beacon says three things about itself. Each one is easy to break
// with a single well-meaning commit, and each one is the reason somebody would
// trust it with a congregation's names:
//
//   1. IT SHIPS NO KEYS, AND RUNS WITH NO CONFIGURATION. Clone it and it works
//      — a sample church, in the browser, with nothing to sign up for. Point it
//      at your own database and it becomes real. Neither the keys nor the
//      hostnames of anybody else's deployment are in here.
//   2. IT PHONES NOBODY. No analytics, no error reporting, no telemetry, no
//      "anonymous usage statistics". A church's activity is the church's.
//   3. IT CARRIES NOBODY'S PIPELINE. This repository was extracted from a
//      private one that has deployment monitoring, status notifications and its
//      own reporting workflow. None of that belongs to the people who fork this,
//      and some of it would quietly report to somebody else's systems.
//
// ---------------------------------------------------------------------------
// RULE 1 CHANGED ON 2026-08-15, DELIBERATELY, AND THIS NOTE IS THE RECORD.
//
// It used to read "IT HAS NO BACKEND", and it was enforced by banning
// @supabase/* as a dependency outright. That made the project honest and also
// made it a dead end: the whole point of releasing Hope Beacon is that another
// Adventist developer can stand up their OWN, and a project that forbids the
// database SDK can never be the thing they run for a real congregation.
//
// What actually protected people was never the absence of a backend. It was
// the absence of SOMEBODY ELSE'S backend — no keys, no hostnames, no pipeline
// reporting to a stranger's systems. Those are all still enforced below, and
// more strictly than before.
//
// The zero-configuration promise is enforced too, and that is the half people
// forget: a fork must still run with no database at all, because "clone it and
// look at it" is what lets a church evaluate this before committing to
// anything. Requiring a Supabase project to see the app would quietly kill
// that, and no dependency check would notice.
//
// Changed with the owner's explicit decision. If you are reading this because
// you want to put the old rule back, the question to ask first is which of the
// two promises you are protecting — because they are not the same promise.
//
//   node tests/no-backend.js
//
// Plain Node, no dependencies. Exits non-zero on any violation.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

let tracked = [];
try {
  tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  console.log('BAD not a git repository');
  process.exit(1);
}
ok(tracked.length > 20, `${tracked.length} tracked files to check`);

// `git ls-files` reports the INDEX, which can name a file that is no longer on
// disk — delete a staged file and it is still listed. Reading it then throws a
// stack trace that looks like a broken test rather than what it is. Say so
// plainly instead, and carry on checking everything that does exist.
const missing = tracked.filter((f) => !fs.existsSync(path.join(root, f)));
ok(
  missing.length === 0,
  missing.length
    ? `tracked but not on disk: ${missing.join(', ')} — run \`git add -A\``
    : 'every tracked file is on disk',
);
tracked = tracked.filter((f) => !missing.includes(f));

const source = tracked.filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f));

// Rule 1 needs the text files before rule 3 defines them. A function rather
// than a hoisted const, so the two cannot drift apart.
const textFilesEarly = () =>
  tracked.filter(
    (f) => !/package-lock\.json|\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(f),
  );

// ---------------------------------------------------------------------------
// 1. No keys, and it still runs with nothing configured.
//
// A database SDK is now allowed — see the note at the top. What is not allowed
// is a credential, or a default that points somewhere real, or an app that
// refuses to start until somebody signs up for something.
// ---------------------------------------------------------------------------
const pkg = JSON.parse(read('package.json'));

// The app must be able to boot with the environment completely empty. The way
// that is guaranteed is that every read of a backend variable has a fallback
// and nothing throws on absence — so a bare `process.env.X!` (non-null
// assertion) or a `throw` when a key is missing is the thing to catch.
const envReads = [];
for (const f of source) {
  if (f.startsWith('tests/')) continue;
  read(f)
    .split('\n')
    .forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (/process\.env\.NEXT_PUBLIC_SUPABASE[A-Z_]*!/.test(line)) {
        envReads.push(`${f}:${i + 1} asserts a key is present with !`);
      }
      if (/throw[^\n]*(SUPABASE|environment variable|is required)/i.test(line)) {
        envReads.push(`${f}:${i + 1} throws when a key is missing`);
      }
    });
}
ok(
  envReads.length === 0,
  envReads.length === 0
    ? 'nothing demands a backend variable — the app runs with an empty environment'
    : `the app will not start without configuration: ${envReads.join('; ')}`,
);

// A committed key is the failure this whole file exists to prevent. Checked by
// SHAPE rather than by name, because the next key will be called something
// nobody has thought of yet: a Supabase anon/service JWT is three dot-separated
// base64url runs beginning `eyJ`.
const keyish = [];
for (const f of textFilesEarly()) {
  read(f)
    .split('\n')
    .forEach((line, i) => {
      if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(line)) {
        keyish.push(`${f}:${i + 1}`);
      }
    });
}
ok(
  keyish.length === 0,
  keyish.length === 0
    ? 'no JSON Web Token is committed anywhere'
    : `something shaped exactly like a key is committed at: ${keyish.join(', ')}`,
);

// `.env.example` teaches the shape and must never carry a value.
if (tracked.includes('.env.example')) {
  const filled = read('.env.example')
    .split('\n')
    .filter((l) => /^[A-Z_]+=.+/.test(l) && !/^[A-Z_]+=\s*(#|$)/.test(l))
    .filter((l) => !/=\s*(your-|<|\.\.\.|example|changeme|placeholder)/i.test(l));
  ok(
    filled.length === 0,
    filled.length === 0
      ? '.env.example names the variables and sets none of them'
      : `.env.example has real values in it: ${filled.join(' | ')}`,
  );
}

// API routes still have to earn their place. Two stateless ones plus, now, the
// ones a real deployment genuinely needs — each named, so a new server route
// is a decision somebody makes on purpose rather than a thing that appears.
const routes = tracked.filter((f) => /^app\/.*\/route\.(ts|js)$/.test(f));
// Each of these is a server route somebody had to justify, which is the point
// of the list: adding one is a decision, not a drive-by.
//
//   app/sw.js/route.ts          serves the service worker from this origin.
//   app/version.json/route.ts   the app asking itself what build it is serving.
//   app/api/auth/sign-in/route.ts
//       The first-party sign-in gateway. It exists so the browser sends a
//       password to Hope Beacon's own origin and never to a third party, and it
//       returns only the verified session — which is exactly what the checks in
//       tests/security-invariants.mjs assert about it. It arrived with the live
//       session handoff and was never added here, so this suite had been failing
//       on a route the rest of the suite treats as required.
const ALLOWED_ROUTES = [
  'app/sw.js/route.ts',
  'app/version.json/route.ts',
  'app/api/auth/sign-in/route.ts',
];
for (const r of routes) {
  ok(
    ALLOWED_ROUTES.includes(r),
    ALLOWED_ROUTES.includes(r)
      ? `${r} is one of the stateless routes`
      : `${r} is a server route nobody has justified — add it to ALLOWED_ROUTES with a reason`,
  );
}

// ---------------------------------------------------------------------------
// 2. It phones nobody.
//
// Every outbound call in shipped code, listed. The allowed ones are: the app
// asking its OWN origin what build it is serving, and links a person clicks.
// ---------------------------------------------------------------------------
const TELEMETRY = [
  [/google-analytics|gtag\(|googletagmanager/i, 'Google Analytics'],
  [/\bmixpanel\b|\bamplitude\b|segment\.com|\bposthog\b/i, 'a product-analytics SDK'],
  [/\bsentry\b|\bbugsnag\b|\brollbar\b|\bdatadog\b/i, 'an error-reporting SDK'],
  [/vercel\/analytics|@vercel\/speed-insights/i, 'hosting analytics'],
];
let phoned = 0;
for (const f of source) {
  if (f === 'tests/no-backend.js') continue; // it must name them to find them
  const body = read(f);
  for (const [re, what] of TELEMETRY) {
    if (re.test(body)) {
      ok(false, `${f} includes ${what}`);
      phoned++;
    }
  }
}
if (phoned === 0) ok(true, 'no analytics, error reporting or telemetry anywhere');

// A fetch to an absolute URL is a call to somebody else's server. Relative ones
// are this app talking to itself, which is fine.
for (const f of source) {
  if (f.startsWith('tests/')) continue;
  const body = read(f);
  const calls = body
    .split('\n')
    // A commented example teaches; it does not call anybody.
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
    .match(/fetch\(\s*['"`]https?:\/\/[^'"`]+/g) || [];
  for (const c of calls) {
    // Its own origin during a local test run is not somebody else's server.
    if (/localhost|127\.0\.0\.1/.test(c)) continue;
    ok(false, `${f} fetches an external URL: ${c.slice(0, 70)}`);
  }
}
ok(true, 'no shipped code fetches an external server');

// ---------------------------------------------------------------------------
// 3. No inherited pipeline.
//
// The specific things that must never be copied back in from the private repo,
// because they report to systems that are not the fork owner's.
// ---------------------------------------------------------------------------
const FORBIDDEN_FILES = [
  [/deploy-watch/, 'deployment monitoring for somebody else’s site'],
  [/keep-warm/, 'a keep-alive for somebody else’s database'],
  [/report-status/, 'a status notifier for somebody else’s channel'],
  [/ci-report/, 'a CI notifier for somebody else’s channel'],
];
for (const [re, what] of FORBIDDEN_FILES) {
  const hit = tracked.filter((f) => re.test(f));
  ok(hit.length === 0, hit.length ? `${hit.join(', ')} is ${what}` : `nothing is ${what}`);
}

// And the words that would mean somebody's private infrastructure came along.
const FORBIDDEN_TERMS = [
  [/library[\s-]?os/i, 'a private reporting pipeline'],
  [/supabase\.co/i, 'a live database hostname'],
  [/\.vercel\.app/i, 'a live deployment hostname'],
  [/SITE_URL|FEEDBACK_INGRESS_TOKEN|FEEDBACK_RESEND/i, 'a private deployment setting'],
  [/service[_-]?role/i, 'a privileged database key'],
];
const textFiles = tracked.filter(
  (f) => !/package-lock\.json|\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(f),
);
let terms = 0;
// A guardrail has to name the thing it looks for, so the guardrails are not
// scanned for their own patterns. Everything else is.
const GUARDRAILS = new Set([
  'tests/no-backend.js',
  'tests/no-secrets.js',
  'tests/security-invariants.mjs',
  // Deployment instructions must name the settings they teach, and the Edge
  // Function must name its server-only runtime variables. They remain subject
  // to the credential-shape scan above, so this permits documentation and
  // server configuration names without permitting an actual key.
  'docs/BUILD-BRIEF.md',
  'docs/DEMO-SETUP.md',
  'supabase/functions/invite/index.ts',
  // .env.example's whole job is to say "never put the service_role key in
  // here". A warning that cannot name the thing it warns about is not a
  // warning, and the alternative — vaguer wording — is worse than the risk.
  //
  // The exemption is narrow and deliberately so: this skips the FORBIDDEN_TERMS
  // scan only. The checks that actually matter for this file still apply — it
  // is still scanned for a committed JSON Web Token, and still required to set
  // no values at all. Naming a key is safe; carrying one is not.
  '.env.example',
]);
for (const f of textFiles) {
  if (GUARDRAILS.has(f)) continue;
  read(f)
    .split('\n')
    .forEach((line, i) => {
      for (const [re, what] of FORBIDDEN_TERMS) {
        if (re.test(line)) {
          ok(false, `${f}:${i + 1} mentions ${what}`);
          terms++;
        }
      }
    });
}
if (terms === 0) ok(true, 'nothing names a private deployment, key or pipeline');

// ---------------------------------------------------------------------------
// 4. Workflows, if any, are the fork owner's own business.
// ---------------------------------------------------------------------------
const wfDir = path.join(root, '.github/workflows');
if (fs.existsSync(wfDir)) {
  for (const f of fs.readdirSync(wfDir)) {
    // Full-line YAML comments are stripped first. A workflow that explains why
    // `pull_request_target` is dangerous is doing the right thing, and a check
    // that fails it teaches people to delete the explanation.
    const wf = read(path.join('.github/workflows', f))
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    ok(!/pull_request_target/.test(wf), `${f}: no pull_request_target`);
    ok(
      !/issues:\s*write|contents:\s*write/.test(wf) || /permissions/.test(wf),
      `${f}: any write permission is declared explicitly`,
    );
    ok(!/secrets\./.test(wf), `${f}: needs no repository secrets to run`);
  }
}

// ---------------------------------------------------------------------------
// The Orbit is not ours to publish.
//
// It is a separate, private product of the owner's. It was in this repository —
// roughly 1,375 lines across two components, a playlists module and an e2e
// suite, wired into the right rail of every room, with a section on the media
// page branded "Powered by The Orbit". Public, in an open-source project, for
// weeks.
//
// It got there because nobody was looking for it. The open-source boundary pass
// that ran earlier checked for Library OS content, Foundation tooling and
// personal data — the things on the written list — and the Orbit is none of
// those. A checklist answers the question it asks, not the question it stands
// in for, and the real question was never "is Library OS content in here", it
// was "is anything in here not ours to publish".
//
// So the check is by NAME, not by file. Deleting four files is easy to redo by
// accident: a copied component, a pasted rail, a re-imported module. A name is
// what survives all of those.
// ---------------------------------------------------------------------------
{
  const banned = /\bOrbit\b/;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (['node_modules', '.next', '.next-dev', '.git'].includes(entry.name)) continue;
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.(ts|tsx|js|jsx|mjs|md|json)$/.test(entry.name)) {
        // This file names it in order to ban it.
        if (rel.endsWith('tests/no-backend.js')) continue;
        if (banned.test(fs.readFileSync(path.join(root, rel), 'utf8'))) offenders.push(rel);
      }
    }
  };
  for (const d of ['app', 'components', 'lib', 'tests', 'docs', 'scripts']) {
    if (fs.existsSync(path.join(root, d))) walk(d);
  }
  ok(
    offenders.length === 0,
    offenders.length === 0
      ? 'the Orbit, a private product, is nowhere in this public repository'
      : `the Orbit is a PRIVATE product and appears in: ${offenders.join(', ')}`,
  );
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
