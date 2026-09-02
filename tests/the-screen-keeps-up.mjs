// The screen keeps up without anybody pressing refresh.
//
// WHAT WAS WRONG. Exactly one table in the whole app was published for
// realtime — `messages` — so a conversation updated itself and every other
// screen did not. Post a notice, approve somebody, add a study, propose a time,
// and the person looking at that screen saw the old version until they pulled
// to refresh. In front of a room that reads as the app being broken.
//
// THIS HAS TWO HALVES AND EITHER ONE ALONE DOES NOTHING, which is exactly why
// it is worth a test rather than a glance:
//
//   * the DATABASE half — a table not in the `supabase_realtime` publication
//     can never produce an event, so no client code would have helped;
//   * the APP half — a published table nobody subscribes to changes in silence.
//
// So this checks that every set the app subscribes to is actually published,
// and that the screens are wired. A set naming a table the migration does not
// publish is the failure that would otherwise ship looking fine.
//
//   node tests/the-screen-keeps-up.mjs
//
// Reads the source and the migration; needs no database and no network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// ---- The database half ----
const dir = 'supabase/migrations';
const migration = fs
  .readdirSync(path.join(root, dir))
  .filter((f) => f.includes('the_screen_keeps_up'))
  .sort()
  .pop();
ok(!!migration, `the publication migration is present (${migration ?? 'MISSING'})`);
const sql = migration ? read(`${dir}/${migration}`) : '';

const published = new Set(
  [...sql.matchAll(/^\s*'([a-z_]+)',?\s*(?:--.*)?$/gm)].map((m) => m[1]),
);
ok(published.size >= 15, `it publishes the tables the screens watch (${published.size})`);

// Realtime evaluates RLS per subscriber, but only if it can see the columns the
// policy tests. Every policy here decides by church_id or author_id, neither of
// which is a primary key, so without FULL an UPDATE or DELETE has nothing to
// test and the event is dropped.
ok(/replica identity full/i.test(sql), 'and sets REPLICA IDENTITY FULL so RLS can be evaluated');

// The safeguarding record is the last place to widen a surface for a
// convenience nobody asked for.
for (const kept of ['discipline_log', 'reports', 'trials', 'security_audit_events', 'seeker_notes']) {
  ok(!published.has(kept), `${kept} is deliberately NOT published`);
}

// ---- The app half ----
const hook = read('lib/live/keep-up.ts');
ok(/export function useKeepUp/.test(hook), 'lib/live/keep-up.ts exports useKeepUp');
ok(/removeChannel/.test(hook), 'and tears its channel down on unmount');
ok(/setTimeout/.test(hook), 'and settles a burst of writes into one reload');

// Every table any set names must actually be published, or that screen is
// subscribing to silence.
const sets = [...hook.matchAll(/export const (KEEP_UP_\w+) = \[([^\]]*)\]/g)];
ok(sets.length >= 5, `the screens have named their tables (${sets.length} sets)`);
for (const [, name, body] of sets) {
  for (const table of [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])) {
    ok(published.has(table), `${name} watches ${table}, and the migration publishes it`);
  }
}

// The screens somebody actually looks at during a demonstration.
for (const [file, expected] of [
  ['components/LiveAnnouncements.tsx', 'KEEP_UP_NOTICES'],
  ['components/LiveLibrary.tsx', 'KEEP_UP_LIBRARY'],
  ['components/LiveMeetings.tsx', 'KEEP_UP_MEETINGS'],
  ['components/LivePrayer.tsx', 'KEEP_UP_PRAYER'],
  ['components/LiveStudies.tsx', 'KEEP_UP_STUDIES'],
  ['components/LiveBlog.tsx', 'KEEP_UP_BLOG'],
  ['components/LiveBell.tsx', 'KEEP_UP_BELL'],
  ['components/LiveDesk.tsx', 'KEEP_UP_PEOPLE'],
]) {
  const src = read(file);
  ok(
    src.includes(`useKeepUp(${expected}`),
    `${file.replace('components/', '')} keeps up (${expected})`,
  );
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
