// Guardrail: this repository is public, so nothing in it may be a secret.
//
// The live app has its own version of this file because it holds a real church's
// backend. This one exists for the opposite reason: everything here is meant to
// be read by strangers, which makes an accidentally committed key worse, not
// better. A private repo leaks to whoever has access; a public one leaks to a
// crawler within minutes, and the first thing an automated scanner does with a
// found key is use it.
//
//   node tests/no-secrets.js
//
// Plain Node, no dependencies. Exits non-zero on any violation.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let bad = 0;
const fail = (m) => {
  bad++;
  console.log(`BAD ${m}`);
};
const ok = (m) => console.log(`OK  ${m}`);

let tracked = [];
try {
  tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
} catch {
  console.log('BAD could not list tracked files (is this a git repository?)');
  process.exit(1);
}
ok(`${tracked.length} tracked files to check`);

// ---------------------------------------------------------------------------
// 1. Only .env.example, and its secret slots must be empty.
//
// A filled-in example is the single most common way a key reaches a repository:
// somebody pastes a working value in "just to test", and it is committed as
// documentation.
// ---------------------------------------------------------------------------
const envFiles = tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f));
const notExample = envFiles.filter((f) => !/example/i.test(f));
if (notExample.length) fail(`a real env file is committed: ${notExample.join(', ')}`);
else ok('no env file is committed except the example');

for (const f of envFiles) {
  const filled = read(f)
    .split('\n')
    .filter((l) =>
      /^\s*(SUPABASE_SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|FEEDBACK_SUPABASE_ANON_KEY|FEEDBACK_INGRESS_TOKEN|FEEDBACK_RESEND_API_KEY|FEEDBACK_WEBHOOK_URL)\s*=\s*\S+/.test(
        l,
      ),
    );
  if (filled.length) fail(`${f} has a filled-in secret slot: ${filled.map((l) => l.split('=')[0].trim()).join(', ')}`);
  else ok(`${f} names its settings and fills none of them in`);
}

// ---------------------------------------------------------------------------
// 2. No credential literal anywhere.
//
// Shape-based, so it catches a paste regardless of what the variable was called.
// A Supabase key is a JWT and starts "eyJ"; Resend keys start "re_"; the ingress
// token is 64 hex characters.
// ---------------------------------------------------------------------------
const SHAPES = [
  [/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/, 'a JWT (Supabase key)'],
  [/\bre_[A-Za-z0-9]{20,}\b/, 'a Resend API key'],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'a Supabase secret key'],
  [/\bghp_[A-Za-z0-9]{30,}\b/, 'a GitHub token'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'a private key'],
];
let literals = 0;
for (const f of tracked) {
  if (/package-lock\.json|\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?)$/.test(f)) continue;
  let body;
  try {
    body = read(f);
  } catch {
    continue;
  }
  body.split('\n').forEach((line, i) => {
    for (const [shape, what] of SHAPES) {
      // The test file naming the shapes is not itself a leak.
      if (f === 'tests/no-secrets.js') continue;
      if (shape.test(line)) {
        fail(`${f}:${i + 1} looks like ${what}`);
        literals++;
      }
    }
  });
}
if (literals === 0) ok('no credential-shaped literal in any tracked file');

// ---------------------------------------------------------------------------
// 3. Nothing secret under a NEXT_PUBLIC_ prefix.
//
// Anything so named is inlined into the JavaScript bundle at build time and
// served to every visitor. The prefix is a promise that the value is public.
// ---------------------------------------------------------------------------
let publicLeaks = 0;
for (const f of tracked.filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f))) {
  read(f)
    .split('\n')
    .forEach((line, i) => {
      if (/NEXT_PUBLIC_[A-Z_]*(SERVICE_ROLE|SECRET|PRIVATE|INGRESS|RESEND)/.test(line)) {
        fail(`${f}:${i + 1} exposes a secret-sounding value to the browser`);
        publicLeaks++;
      }
    });
}
if (publicLeaks === 0) ok('no secret is exposed under a NEXT_PUBLIC_ prefix');

// ---------------------------------------------------------------------------
// 4. The service-role key is never named in code that can reach a browser.
//
// It bypasses Row Level Security completely. In this repository it should not
// appear at all: there is no backend here to use it with.
// ---------------------------------------------------------------------------
const serviceRole = tracked.filter(
  (f) =>
    /^(app|components|lib)\//.test(f) &&
    /\.(ts|tsx|js|jsx|mjs)$/.test(f) &&
    /SERVICE_ROLE|service_role/.test(read(f)),
);
if (serviceRole.length) fail(`service-role key named in shipped code: ${serviceRole.join(', ')}`);
else ok('the service-role key is named nowhere in shipped code');

// ---------------------------------------------------------------------------
// 5. No real person in the sample data.
//
// The seed is fiction and must stay fiction. A real member's name, email or
// phone number reaching a public repository is a privacy incident regardless of
// how harmless the record looks.
// ---------------------------------------------------------------------------
const seed = 'lib/demo/seed.ts';
if (tracked.includes(seed)) {
  const body = read(seed);
  const emails = body.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [];
  // Reserved by RFC 2606 and RFC 6761: .example, .test, .invalid and .localhost
  // can never be registered by anyone, so an address there can never reach a
  // real inbox. A no-reply sender is a system address rather than a person.
  // Anything else is a domain somebody could actually own.
  const RESERVED = /@([\w-]+\.)*(example|test|invalid|localhost)$|@example\.(com|net|org)$/i;
  const SYSTEM = /^(no-?reply|postmaster|donotreply)@/i;
  const foreign = emails.filter((e) => !RESERVED.test(e) && !SYSTEM.test(e));
  if (foreign.length) {
    fail(`${seed} contains addresses outside the reserved example domains: ${[...new Set(foreign)].join(', ')}`);
  } else {
    ok(`sample data uses reserved example domains only (${emails.length} addresses)`);
  }
  const phones = body.match(/\+?\d[\d\s().-]{9,}\d/g) || [];
  if (phones.length) fail(`${seed} contains something phone-shaped: ${phones.slice(0, 3).join(', ')}`);
  else ok('sample data contains no phone numbers');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
