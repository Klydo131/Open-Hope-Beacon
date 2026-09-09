// Every room keeps up, and a new one cannot ship without doing so.
//
// ---------------------------------------------------------------------------
// REPORTED AS: "I still dont like that most users complain that they need to
// refresh their browser to get the real time results."
//
// WHAT WAS ALREADY RIGHT, ruled out before anything was added:
//
//   The publication. Migration 20260902020000 publishes twenty-four tables
//   with replica identity full.
//
//   The socket's authentication. Checked in the INSTALLED library rather than
//   assumed: @supabase/supabase-js 2.112.3 wires the custom `accessToken`
//   callback into its realtime client, and realtime-js re-runs setAuth on
//   every heartbeat -- so the hour-long token life does not quietly kill the
//   stream on a tab left open, which was the first and most plausible guess.
//
// THE FAULT WAS COVERAGE. Sixteen components loaded data and subscribed to
// nothing at all, including every screen a person actually lives on: the
// Explorer's, the Guide's and the Director's. And eighteen tables were never
// published, so a screen watching one of those would have received nothing
// however correctly it subscribed.
//
// A mechanism that most of the app never calls is indistinguishable, from the
// outside, from one that does not work. So the check that matters here is not
// "does the hook exist" -- it did -- but "is there any live screen that fails
// to call it", which is what block 1 measures, and "does any set name a table
// the database never publishes", which is block 2. The first catches the
// seventeenth screen; the second catches a set that looks wired and is deaf.
//
//   node tests/every-room-keeps-up.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
const stripSql = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

/** Every .tsx under a directory, recursively. */
function screens(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) screens(rel, out);
    else if (entry.name.endsWith('.tsx')) out.push(rel);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. NO LIVE SCREEN LOADS WITHOUT LISTENING
// ---------------------------------------------------------------------------
//
// A component that reads the live database and holds a loader is a component
// somebody sits in front of while somebody else changes the thing it is
// showing. Either it subscribes, or it is stale by design and says so here.
// DELIBERATELY NOT LIVE, and named here so the exemption is a decision on the
// record rather than a screen nobody noticed.
//
// tests/the-screen-keeps-up.mjs asserts that the safeguarding tables are not
// published at all: the safeguarding record is the last place to widen a
// surface for a convenience nobody asked for. Row level security would allow
// it -- realtime evaluates the same policies as a SELECT -- and the rule is
// still no, because "allowed" and "wise" are different questions.
//
// The first version of THIS change published them anyway and wired these three
// screens. The gate caught it. So they reload when somebody opens them, which
// is the cost of that rule, and it is a cost worth naming out loud.
const STAYS_ON_A_RELOAD = new Set([
  'components/LiveSafeguarding.tsx',   // reports, report_files
  'components/LiveTrialRoom.tsx',      // trials, statements, discipline log
  'components/LiveSecurityAudit.tsx',  // security_audit_events
]);

{
  const deaf = [];
  for (const file of [...screens('components'), ...screens('app')]) {
    if (STAYS_ON_A_RELOAD.has(file)) continue;
    const src = strip(read(file));
    if (!/@\/lib\/live\/data/.test(src)) continue;
    // A loader: something re-runnable. A component that only writes has none.
    // PER LOADER, NOT PER FILE. Several of these files hold two or three
    // components, and a file-level check passes as soon as ANY one of them
    // subscribes -- which is exactly how the Guide's roster sat deaf inside a
    // file whose conversation was wired. Caught by breaking it on purpose.
    for (const m of src.matchAll(/const (\w*[Ll]oad\w*) = useCallback\(async/g)) {
      const name = m[1];
      const listens = new RegExp(`useKeepUp\\([A-Z_0-9]+, ${name}\\)`).test(src)
        || new RegExp(`subscribeToMessages\\([^)]*=> void ${name}\\(\\)`).test(src);
      if (!listens) deaf.push(`${file}  ${name}()`);
    }
  }
  ok(deaf.length === 0,
     `every loader on a live screen is re-run when its data changes${deaf.length ? `\n        deaf: ${deaf.join('\n              ')}` : ''}`);
}

// ---------------------------------------------------------------------------
// 2. EVERY TABLE A SCREEN WATCHES IS ACTUALLY PUBLISHED
// ---------------------------------------------------------------------------
//
// The failure this catches is the quiet one. A set can name a table, a screen
// can subscribe to it perfectly, and nothing arrives -- because Postgres never
// wrote the change to the replication stream. From the component's side that
// is indistinguishable from "nobody changed anything".
{
  const hook = read('lib/live/keep-up.ts');
  const watched = new Set();
  for (const m of hook.matchAll(/export const KEEP_UP_\w+ =\s*([^;]+);/g)) {
    for (const t of m[1].matchAll(/'([a-z_]+)'/g)) watched.add(t[1]);
  }
  ok(watched.size > 20, `the sets name ${watched.size} tables`);

  const dir = path.join(root, 'supabase', 'migrations');
  const sql = stripSql(
    fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
      .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n'),
  );
  // Both migrations publish from an array of names; a table is published if it
  // appears inside one of those arrays.
  const published = new Set();
  for (const m of sql.matchAll(/text\[\] := array\[([\s\S]*?)\];/g)) {
    for (const t of m[1].matchAll(/'([a-z_]+)'/g)) published.add(t[1]);
  }
  published.add('messages'); // published before either migration existed

  const deaf = [...watched].filter((t) => !published.has(t)).sort();
  ok(deaf.length === 0,
     `every watched table is published${deaf.length ? ` (missing: ${deaf.join(', ')})` : ''}`);
}

// ---------------------------------------------------------------------------
// 3. THE CONVERSATION CAN REPORT A DELETION
// ---------------------------------------------------------------------------
//
// `messages` was the first table ever published and the only one left on the
// default replica identity. A DELETE then carries the primary key alone, so a
// subscription filtered on `pairing_id` cannot tell whether the deleted row
// was in this conversation, and a removed message stays on screen.
{
  const mine = stripSql(read('supabase/migrations/20260908170000_every_room_keeps_up.sql'));
  ok(/alter table public\.messages replica identity full/.test(mine),
     'the busiest table carries its whole row, like every other published one');
  ok(/'pairing_media'/.test(mine),
     'and a file sent into a conversation is published too');

  // The correction, kept as a check so it cannot be undone by accident.
  for (const off of ['reports', 'trials', 'discipline_log', 'security_audit_events',
                     'seeker_notes', 'report_files', 'trial_statements']) {
    ok(!new RegExp(`'${off}'`).test(mine),
       `${off} is deliberately left off the wire`);
  }
  const hook = read('lib/live/keep-up.ts');
  for (const off of ['reports', 'trials', 'discipline_log', 'security_audit_events', 'seeker_notes']) {
    ok(!new RegExp(`'${off}'`).test(hook),
       `and no set names ${off}, which would be subscribing to silence`);
  }
}

// ---------------------------------------------------------------------------
// 4. THE HOOK IS STILL CHEAP ENOUGH TO PUT EVERYWHERE
// ---------------------------------------------------------------------------
//
// Wiring twenty screens is only safe because a burst is one reload and a set is
// one socket. If either of those regressed, this change would have replaced
// "refresh the page" with "the app is slow", which is not an improvement.
{
  const hook = strip(read('lib/live/keep-up.ts'));
  ok(/setTimeout\(\(\) => \{ void latest\.current\(\); \}, SETTLE_MS\)/.test(hook),
     'a burst of writes still costs one reload, not one per row');
  ok(/const channel = client\.channel\(/.test(hook)
     && (hook.match(/client\.channel\(/g) ?? []).length === 1,
     'and a set of tables still costs one channel, not one per table');
  ok(/latest\.current = reload/.test(hook),
     'and a component rebuilding its loader does not resubscribe every render');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
