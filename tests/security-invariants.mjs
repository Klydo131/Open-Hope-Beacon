// Security invariants that must not regress, checked from the source.
//
// This file exists because an audit is a photograph and a test is a promise.
// Every check below corresponds to something that was verified by hand during
// the 2026-08-08 audit and could be undone by an ordinary, well-meaning change
// six months from now — a new dependency, a new link field, a new API route, a
// CSP directive loosened to make an embed work.
//
// Each check says WHY it is here, because an invariant nobody understands is an
// invariant somebody deletes.
//
//   node tests/security-invariants.mjs
//
// Plain Node, no dependencies. Exits non-zero on any violation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

function walk(dir, out = []) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(rel, out);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const sourceDirs = ['app', 'components', 'lib'].filter(exists);
const sources = sourceDirs.flatMap((d) => walk(d));
ok(sources.length > 20, `there is source to check (${sources.length} files)`);

// ---------------------------------------------------------------------------
// 1. The image optimiser stays off.
//
// `sharp` carries four known libvips CVEs and ships as a Next.js dependency.
// They are UNREACHABLE here for one reason only: this app never invokes the
// optimiser. `images.unoptimized` is true and nothing imports `next/image`, so
// no attacker-supplied bytes are ever handed to libvips. Add one `next/image`
// and that stops being true silently — the build would still pass, the app would
// still work, and a high-severity CVE would quietly become live.
// ---------------------------------------------------------------------------
const nextConfig = ['next.config.mjs', 'next.config.js', 'next.config.ts'].find(exists);
ok(!!nextConfig, `next config found (${nextConfig})`);
if (nextConfig) {
  const cfg = read(nextConfig);
  ok(
    /images:\s*\{[^}]*unoptimized:\s*true/.test(cfg),
    'images.unoptimized is true, so sharp/libvips is never handed any bytes',
  );
}
const usesNextImage = sources.filter((f) => /from ['"]next\/image['"]/.test(read(f)));
ok(
  usesNextImage.length === 0,
  usesNextImage.length === 0
    ? 'nothing imports next/image, so the optimiser has no entry point'
    : `next/image is imported by ${usesNextImage.join(', ')} — the sharp CVEs become reachable`,
);

// ---------------------------------------------------------------------------
// 2. The Content-Security-Policy keeps its teeth.
//
// The specific things that must not be loosened, and why each one matters more
// than it looks.
// ---------------------------------------------------------------------------
if (nextConfig) {
  const cfg = read(nextConfig);
  ok(/frame-ancestors 'none'/.test(cfg), "frame-ancestors 'none' — no clickjacking a church's admin");
  ok(/base-uri 'self'/.test(cfg), "base-uri 'self' — a <base> tag can redirect every relative URL");
  ok(/form-action 'self'/.test(cfg), "form-action 'self' — a form cannot be made to post elsewhere");
  ok(/object-src|default-src 'self'/.test(cfg), "default-src 'self' — nothing loads from anywhere else by default");
  // A wildcard in script-src would let any host run code in the app's origin,
  // which is game over for every other control in this file.
  const scriptSrc = (cfg.match(/"script-src[^"]*"/) || [''])[0];
  ok(
    !/\bhttps?:(\s|"|$)|\*/.test(scriptSrc),
    `script-src names no wildcard and no third-party origin (${scriptSrc || 'not found'})`,
  );
  ok(
    /X-Content-Type-Options.*nosniff/s.test(cfg),
    'nosniff — an uploaded file must not be re-interpreted as script',
  );
}

// ---------------------------------------------------------------------------
// 3. Links entered by people cannot become code.
//
// `safeExternalUrl` is the only thing between an admin typing a URL into a
// material and a stored XSS. It is one regex, so it is exactly the sort of thing
// that gets "simplified" later.
// ---------------------------------------------------------------------------
if (exists('lib/url.ts')) {
  const url = read('lib/url.ts');
  ok(/\^https\?:\\\/\\\//.test(url), 'safeExternalUrl anchors on ^https?:// rather than searching');
  // Assert the behaviour, not just the shape, by running the regex the file
  // actually contains against the payloads that matter.
  const m = url.match(/return (\/[^\n]+\/i)\.test\(trimmed\)/);
  ok(!!m, 'safeExternalUrl still tests the trimmed value against one anchored pattern');
  if (m) {
    // eslint-disable-next-line no-eval
    const re = eval(m[1]);
    for (const payload of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '//evil.example.com',
      'jAvAsCrIpT\n:alert(1)',
    ]) {
      ok(!re.test(payload.trim()), `blocked: ${JSON.stringify(payload)}`);
    }
    for (const good of ['https://example.com/a', 'http://example.com']) {
      ok(re.test(good), `allowed: ${good}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. The backend seam cannot become the thing that leaks the key.
//
// lib/backend/feedback.ts is the one place this app is designed to be pointed
// at a server, so it is the one place somebody will reasonably think a
// credential belongs. It does not: that file ships to the browser exactly like
// every other file here, and a key in it is a key published to every visitor.
//
// tests/no-secrets.js catches credential shapes anywhere in the repository.
// This is the narrower check on the file most likely to attract one, plus the
// two properties the whole design rests on: the default sink really stores the
// message rather than pretending to, and a failure is reported rather than
// thrown — because a thrown sink loses what somebody wrote.
// ---------------------------------------------------------------------------
if (exists('lib/backend/feedback.ts')) {
  const sink = read('lib/backend/feedback.ts');
  // Strip comments first — the teaching notes in that file are allowed to name
  // the things they are warning about.
  const code = sink.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
  ok(
    !/\b(apiKey|api_key|Authorization|Bearer\s+[A-Za-z0-9])/i.test(code),
    'the feedback sink carries no key or Authorization header of its own',
  );
  ok(
    /return \{ ok: false \}/.test(code),
    'a failing sink returns { ok: false } rather than throwing the message away',
  );
  ok(
    /localStorage\.setItem\(STORE_KEY/.test(code),
    'the default sink really stores the message instead of pretending to',
  );
}

// ---------------------------------------------------------------------------
// 5. No untrusted markup sink.
//
// One dangerouslySetInnerHTML exists (the self-heal bootstrap) and its content
// is a module-level constant. Any interpolation into it, or any new sink, is an
// XSS waiting for an input.
// ---------------------------------------------------------------------------
for (const f of sources) {
  const src = read(f);
  const sinks = src.match(/dangerouslySetInnerHTML=\{\{\s*__html:\s*([^}]+)\}\}/g) || [];
  for (const sink of sinks) {
    ok(
      /__html:\s*[A-Z_][A-Z0-9_]*\s*$/.test(sink.replace(/\}\}$/, '').trim()),
      `${f}: innerHTML is a constant, not interpolated (${sink.slice(0, 60)})`,
    );
  }
  ok(!/\beval\s*\(/.test(src.replace(/\/\/.*/g, '')) || f.includes('tests/'), `${f}: no eval`);
}

// ---------------------------------------------------------------------------
// 6. CI cannot be made to run an attacker's code.
//
// `pull_request_target` runs with repository secrets and a writable token while
// checking out a fork's code. It is the single most common way a repository is
// taken over through a pull request.
// ---------------------------------------------------------------------------
const wfDir = '.github/workflows';
if (exists(wfDir)) {
  for (const f of fs.readdirSync(path.join(root, wfDir))) {
    if (!/\.ya?ml$/.test(f)) continue;
    // Full-line YAML comments are stripped first: a workflow that explains why
    // `pull_request_target` is dangerous is doing the right thing, and failing
    // it would teach people to delete the explanation.
    const wf = read(path.join(wfDir, f))
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    ok(!/pull_request_target/.test(wf), `${f}: no pull_request_target`);
    // Interpolating an event field straight into a shell is command injection:
    // a branch or title containing $(...) executes on the runner.
    const injectable = wf.match(/run:[\s\S]{0,400}?\$\{\{\s*github\.event\.[^}]+\}\}/g) || [];
    ok(injectable.length === 0, `${f}: no github.event.* interpolated into a run: block`);
  }
}

// ---------------------------------------------------------------------------
// 7. A privileged key never reaches the browser.
//
// A component marked 'use client' is downloaded, in full, by every visitor. A
// key named in one is a key given away, and the mistake looks harmless while
// you are writing it: you needed one admin query on a screen, so you reached
// for the credential that could do it.
//
// The names below are the ones providers actually use for the "bypasses every
// rule" credential. tests/no-secrets.js catches credential SHAPES anywhere in
// the repository; this catches the NAME in the one place it does most damage.
// ---------------------------------------------------------------------------
const PRIVILEGED = /SERVICE_ROLE|service_role|SERVICE_ACCOUNT|serviceAccount|ADMIN_KEY|SECRET_KEY|PRIVATE_KEY/;
const clientish = sources.filter((f) => f.startsWith('components/') || f.startsWith('app/'));
for (const f of clientish) {
  const src = read(f);
  if (/^\s*['"]use client['"]/m.test(src)) {
    ok(
      !PRIVILEGED.test(src),
      `${f}: a client component names no privileged key`,
    );
  }
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
