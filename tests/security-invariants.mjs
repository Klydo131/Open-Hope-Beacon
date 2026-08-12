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

// ---------------------------------------------------------------------------
// 9. A push notification chooses the SCREEN, never the SITE.
//
// The service worker takes a URL out of the push payload and hands it to
// client.navigate()/clients.openWindow(). Unvalidated, that means one
// compromised or simply mistaken push sends every phone that taps the
// notification anywhere on the internet, inside the window the person believes
// is this app. The worker resolves the value against its own origin and drops
// anything that leaves it; this check is here because that guard is four lines
// inside an escaped string constant and is very easy to lose in a rewrite.
// ---------------------------------------------------------------------------
const swRoute = ['app/sw.js/route.ts', 'app/sw.js/route.js'].find(exists);
ok(!!swRoute, `service worker route found (${swRoute})`);
if (swRoute) {
  const raw = read(swRoute);
  const m = raw.match(/const SOURCE = ("(?:[^"\\]|\\.)*");/s);
  ok(!!m, `${swRoute}: the worker source is a single string constant`);
  if (m) {
    const worker = JSON.parse(m[1]);
    // Parse it. A worker with a syntax error is served happily by this route
    // and then fails silently in the browser, which costs the whole offline
    // shell and the update path with it.
    ok(
      (() => {
        try {
          new Function(worker.split('__BEACON_BUILD__').join('x'));
          return true;
        } catch {
          return false;
        }
      })(),
      `${swRoute}: the generated worker parses as JavaScript`,
    );
    const click = worker.slice(worker.indexOf("addEventListener('notificationclick'"));
    const handler = click.slice(0, click.indexOf('\n});'));
    ok(
      /new URL\(\s*raw\s*,\s*self\.location\.origin\s*\)/.test(handler),
      `${swRoute}: the notification target is resolved against this origin`,
    );
    ok(
      /u\.origin === self\.location\.origin/.test(handler),
      `${swRoute}: a cross-origin notification target is refused`,
    );
    ok(
      !/const target = \(event\.notification\.data/.test(handler),
      `${swRoute}: the payload URL is not used as the target directly`,
    );
  }
}

// ---------------------------------------------------------------------------
// 10. Search visibility is decided ONCE, and defaults to invisible.
//
// Three separate signals control whether this deployment can be found: the
// `robots` metadata in app/layout.tsx, app/robots.ts, and the X-Robots-Tag
// header in next.config.mjs. They used to be three hard-coded "no"s, each with
// a comment saying "change all three, or none" — an instruction that gets
// followed twice out of three times, and a half-change is the worst outcome
// available: a site indexed while everybody believes it is not.
//
// They now read one variable. This check is what keeps them reading it, and
// what keeps the DEFAULT at "no" — a church deployment holds real people's
// names, so being findable has to be opted into, never arrived at by omission.
// ---------------------------------------------------------------------------
const SWITCH = 'BEACON_PUBLIC_SITE';
ok(exists('lib/site-visibility.ts'), 'the search-visibility switch has one home');
if (exists('lib/site-visibility.ts')) {
  const vis = read('lib/site-visibility.ts');
  ok(
    new RegExp(`process\\.env\\.${SWITCH}\\s*===\\s*'1'`).test(vis),
    `site-visibility opts IN on ${SWITCH}=1, so anything unset stays private`,
  );
}
for (const f of ['app/layout.tsx', 'app/robots.ts']) {
  if (!exists(f)) continue;
  ok(
    /from '@\/lib\/site-visibility'/.test(read(f)),
    `${f}: reads the shared switch rather than hard-coding an answer`,
  );
}
if (nextConfig) {
  const cfg = read(nextConfig);
  // The config is .mjs and cannot import the TypeScript module, so it reads the
  // variable directly. That is the one permitted duplication and this is why it
  // is checked here.
  ok(
    new RegExp(`process\\.env\\.${SWITCH}\\s*===\\s*'1'`).test(cfg),
    `${nextConfig}: reads the same switch, on the same opt-in polarity`,
  );
  ok(
    /X-Robots-Tag/.test(cfg) && /indexable \?\s*\[\]/.test(cfg),
    `${nextConfig}: the noindex header is present unless the switch is on`,
  );
}
// And the default really is private: evaluate it with nothing set.
ok(
  process.env[SWITCH] !== '1',
  `${SWITCH} is not set in this environment, so the checks above describe the default`,
);

// ---------------------------------------------------------------------------
// 11. The mailbox call-to-action is a link this app chose.
//
// `safeExternalUrl` demands an absolute http(s) URL, which is right for a
// material an admin typed and wrong for the mailbox, whose call-to-action is
// normally a path in this same app. So the mailbox uses `safeLinkHref`, which
// accepts a rooted path OR an http(s) URL and refuses everything else.
//
// This was safe by accident before: every value reaching it is composed by the
// app. The day a fork has a server compose these messages, that stops being
// true, and the failure mode is a hostile link inside a message the reader
// believes came from their church.
//
// Behaviour, not shape — the payloads are run through the real function.
// ---------------------------------------------------------------------------
if (exists('lib/url.ts')) {
  const url = read('lib/url.ts');
  ok(/export function safeLinkHref/.test(url), 'lib/url.ts exports safeLinkHref');
  if (/export function safeLinkHref/.test(url)) {
    // This runner cannot import TypeScript, so the guard is reproduced below
    // and then checked, line by line, against the source it was copied from.
    // Reproducing without that check is how a suite ends up proving a stale
    // copy correct while the shipped function does something else.
    const ext = url.match(/return (\/[^\n]+\/i)\.test\(trimmed\)/);
    ok(!!ext, 'safeExternalUrl still tests one anchored pattern');
    if (ext) {
      // eslint-disable-next-line no-eval
      const re = eval(ext[1]);
      const safeExternalUrl = (u) => (u && re.test(u.trim()) ? u.trim() : null);
      const safeLinkHref = (u) => {
        if (!u) return null;
        const t = u.trim();
        if (t.startsWith('//')) return null;
        if (t.startsWith('/')) return t;
        return safeExternalUrl(t);
      };
      // Confirm the reproduction above matches the file, so a change to the
      // real function cannot pass by being tested against a stale copy.
      const body = url.slice(url.indexOf('export function safeLinkHref'));
      ok(/startsWith\('\/\/'\)\) return null/.test(body), 'safeLinkHref refuses protocol-relative');
      ok(/startsWith\('\/'\)\) return trimmed/.test(body), 'safeLinkHref allows a rooted path');
      ok(/return safeExternalUrl\(trimmed\)/.test(body), 'safeLinkHref delegates absolute URLs');

      for (const bad of [
        'javascript:alert(1)',
        ' javascript:alert(1)',
        'JaVaScRiPt:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        '//evil.example/x',
        'evil.example/x',
        'file:///etc/passwd',
      ]) {
        ok(safeLinkHref(bad) === null, `mailbox href refuses ${JSON.stringify(bad)}`);
      }
      for (const good of ['/join?token=abc', '/login', 'https://example.com/a']) {
        ok(safeLinkHref(good) === good, `mailbox href allows ${good}`);
      }
    }
  }
}

if (exists('components/Mailbox.tsx')) {
  const mail = read('components/Mailbox.tsx').replace(/\/\/.*$/gm, '');
  ok(!/href=\{m\.link\}/.test(mail), 'Mailbox never renders m.link as an href directly');
  ok(/safeLinkHref\(m\.link\)/.test(mail), 'Mailbox routes the call-to-action through safeLinkHref');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
