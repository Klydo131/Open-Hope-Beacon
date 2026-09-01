// What a visitor who has not signed in is allowed to touch.
//
// Supabase hands `anon` and `authenticated` every privilege on every new table,
// and Row Level Security is what takes it back. Two habits keep that safe, and
// both are easy to forget in a hurry:
//
//   1. A policy written with no `TO` clause applies to PUBLIC, which includes
//      `anon`.
//   2. A table that keeps the default grant is one careless policy away from
//      being world-readable, because the anonymous key ships inside the
//      JavaScript bundle and anybody who opens the app already has it.
//
// The 2026-09-01 audit found thirteen policies of the first kind and about
// twenty tables of the second. NOTHING WAS LEAKING. Every table was probed as
// `anon` against the live database and every one returned zero rows, because
// each of those policies happened to compare something against `auth.uid()`,
// which is NULL when nobody is signed in, so the test could never pass.
//
// That is safety by arithmetic rather than by design, and it is the kind that
// ends quietly. The next policy — `using (is_published)`, say, or
// `using (church_id = ...)` — would have opened its table to the whole internet
// and looked entirely reasonable in review. Four tables were being saved by a
// second accident: their policy calls a helper that reads a table `anon` cannot
// read, so the query RAISES instead of returning nothing. Delete that inner
// read one day and the accident stops saving them.
//
// These checks read the migration files, not the database, so they run in CI
// with no credentials and no network.
//
//   node tests/the-signed-out-role.mjs
//
// Plain Node, no dependencies. Exits non-zero on any violation.
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

const dir = 'supabase/migrations';
const files = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.sql')).sort();
ok(files.length > 20, `there are migrations to read (${files.length})`);

// Strip comments before matching. A `create policy` inside a comment is prose,
// and prose that fails a security check teaches people to ignore the check.
const strip = (sql) => sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

// A migration file is a ledger entry, not a draft: the ones already applied
// cannot be edited, so sixteen policies WERE created without a role list and
// always will have been. What matters is the state they are in now. A policy
// created without a `TO` clause is only a finding if no later migration went
// back and named its roles.
// Keyed by policy AND table. Policy names only have to be unique per table, so
// matching on the name alone would let an `alter` on one table vouch for a
// same-named policy on another.
const key = (policy, table) =>
  `${policy.replace(/"/g, '').toLowerCase()} on ${table.replace(/"/g, '').toLowerCase().split('.').pop()}`;

const named = new Set();
for (const f of files) {
  for (const m of strip(read(`${dir}/${f}`)).matchAll(
    /alter\s+policy\s+([\w"]+)\s+on\s+([\w".]+)([\s\S]{0,400}?);/gi
  )) {
    if (/\bto\s+authenticated\b/i.test(m[3])) named.add(key(m[1], m[2]));
  }
}

const noRole = [];
const anonGrants = [];
for (const f of files) {
  const sql = strip(read(`${dir}/${f}`));

  // `create policy NAME on TABLE [as ...] [for CMD] to ROLES ...` — the `to`
  // has to appear before the `using` or `with check` that ends the header.
  for (const m of sql.matchAll(
    /create\s+policy\s+([\w".]+)\s+on\s+([\w".]+)([\s\S]*?)(?:using|with\s+check)\s*\(/gi
  )) {
    if (!/\bto\s+[\w"]/i.test(m[3]) && !named.has(key(m[1], m[2]))) {
      noRole.push(`${f}: ${m[1]} on ${m[2]}`);
    }
  }

  // A table privilege handed to the signed-out role. `grant execute on
  // function` is a different question, already governed by the
  // `lock_new_functions` event trigger.
  for (const m of sql.matchAll(/grant\s+(?!execute\b)[\s\S]{0,120}?\bto\s+([^;]*)/gi)) {
    if (/\banon\b/i.test(m[1])) {
      anonGrants.push(`${f}: ${m[0].replace(/\s+/g, ' ').slice(0, 90)}`);
    }
  }
}

ok(noRole.length === 0,
   `every policy ends up naming the roles it is for (${noRole.length} still unnamed)`
   + (noRole.length ? `\n    ${noRole.join('\n    ')}` : ''));

ok(anonGrants.length === 0,
   `no migration grants a table privilege to the signed-out role (${anonGrants.length} found)`
   + (anonGrants.length ? `\n    ${anonGrants.join('\n    ')}` : ''));

// The sweeps above only prove that no NEW migration reopens the door. They
// would pass just as happily if the migration that shut it were deleted, so
// that one is named.
const all = files.map((f) => read(`${dir}/${f}`)).join('\n');

ok(/revoke\s+all\s+on\s+all\s+tables\s+in\s+schema\s+public\s+from\s+anon/i.test(all),
   'the signed-out role is stripped of every table privilege it was given');
ok(/alter\s+default\s+privileges\s+in\s+schema\s+public\s+revoke\s+all\s+on\s+tables\s+from\s+anon/i.test(all),
   'and the default privilege that would quietly hand it back is revoked too');

// Enabling RLS on a new table decides which ROWS a role may see. Revoking the
// grant decides whether it may ask at all. A new table needs both, and each
// has its own event trigger.
ok(/create\s+event\s+trigger\s+lock_new_tables/i.test(all),
   'an event trigger takes the grants off any table created from now on');
ok(/rls_auto_enable|create\s+event\s+trigger\s+ensure_rls/i.test(all),
   'and another turns Row Level Security on for it');
ok(/create\s+event\s+trigger\s+lock_new_functions/i.test(all),
   'the matching guard for new functions is still there');

// Storage holds the bytes; the tables hold the rows describing them. A policy
// matching on the folder name alone lets any signed-in account, in any church,
// list and download the lot — which is what these two did until the same audit.
// The `lesson_files` table was correctly scoped by church the whole time; only
// the bytes were not.
ok(/alter\s+policy\s+lesson_file_read[\s\S]{0,400}?can_access_church/i.test(all),
   'lesson files in storage are scoped to a church the reader may actually access');
ok(/alter\s+policy\s+avatar_read[\s\S]{0,400}?can_access_church/i.test(all),
   'avatars in storage are scoped the same way');

// Ten avatars were stored and only seven belonged to a profile that still
// existed. Three were left behind by deleted accounts: unreachable, because no
// profile remained to render them, but not gone. A person who asks to be
// deleted and whose photograph stays on the server has not been deleted.
ok(/create\s+trigger\s+forget_stored_files[\s\S]{0,200}?on\s+public\.profiles/i.test(all),
   'a deleted account takes its stored pictures out with it');

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
