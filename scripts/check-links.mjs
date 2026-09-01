// Does every resource on the shelf still open?
//
// WHY THIS EXISTS. The starter kit is twenty links to other people's websites.
// Nothing in this repository controls them. A publisher reorganises, a PDF moves,
// a ministry lets a domain lapse — and the church finds out when an Explorer taps
// a resource on their first day and gets a 404. That is the worst possible moment
// for it, and nothing else in the test suite would ever notice, because every
// other check reads the source rather than the internet.
//
// It could not be written to run where it was written: that sandbox has no route
// out, so `curl` to any of these hosts fails at the proxy. GitHub Actions does
// have a route out, which is why this runs there and on a schedule rather than in
// `npm run verify`.
//
//   node scripts/check-links.mjs
//
// Exits non-zero if any link is dead. A link that merely redirects is fine — that
// is a publisher tidying up, not a broken shelf.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'lib/starter-kit.ts'), 'utf8');

const links = [...src.matchAll(/id:\s*'([^']+)',[\s\S]{0,600}?external_url:\s*\n?\s*'([^']+)'/g)]
  .map((m) => ({ id: m[1], url: m[2] }));

if (links.length === 0) {
  console.error('No links found in lib/starter-kit.ts — the parse is wrong, not the shelf.');
  process.exit(2);
}

console.log(`Checking ${links.length} links…\n`);

// HEAD first: it is the polite request, and most of these are large PDFs we have
// no reason to download. Some servers refuse HEAD, so a failure there falls back
// to a ranged GET that asks for the first byte only.
async function reach(url) {
  const opts = {
    redirect: 'follow',
    headers: { 'User-Agent': 'OpenHopeBeacon-LinkCheck/1.0 (+church resource shelf)' },
    signal: AbortSignal.timeout(25000),
  };
  try {
    const head = await fetch(url, { ...opts, method: 'HEAD' });
    if (head.ok) return { ok: true, status: head.status };
    const get = await fetch(url, {
      ...opts,
      method: 'GET',
      headers: { ...opts.headers, Range: 'bytes=0-0' },
    });
    return { ok: get.ok, status: get.status };
  } catch (cause) {
    return { ok: false, status: cause?.name === 'TimeoutError' ? 'timed out' : String(cause?.message ?? cause) };
  }
}

const dead = [];
for (const link of links) {
  const { ok, status } = await reach(link.url);
  console.log(`${ok ? 'OK ' : 'BAD'} ${link.id.padEnd(24)} ${status}  ${link.url}`);
  if (!ok) dead.push({ ...link, status });
}

if (dead.length) {
  console.log(`\n${dead.length} of ${links.length} links are not reachable:\n`);
  for (const d of dead) console.log(`  ${d.id}  ${d.url}  (${d.status})`);
  console.log('\nFix the address in lib/starter-kit.ts, or remove the resource.');
  process.exit(1);
}

console.log(`\nRESULT: all ${links.length} links open.`);
