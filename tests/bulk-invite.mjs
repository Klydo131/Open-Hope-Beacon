// Reading a pasted list of people.
//
// WHY THIS IS TESTED AND THE REST OF THE PANEL IS NOT. Everything else in bulk
// invitation is a loop over a call that is already covered. This function is
// the part where a mistake is silent AND expensive: it decides who gets an
// email. A parser that drops a line invites twenty-four of twenty-five and
// nobody notices the missing one; a parser that keeps a duplicate sends
// somebody two invitations, which switches off the first and produces exactly
// the "my link says it expired" report that cost a week earlier.
//
// It is transpiled and RUN, not read. Checking the source for the word
// "duplicate" proves nothing about what comes out.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const SRC = 'components/LiveBulkInvite.tsx';
let src = readFileSync(SRC, 'utf8');
// Take the one exported function this file is about. The rest is React and
// would need a DOM to import.
const start = src.indexOf('export function parseInviteList');
const end = src.indexOf('type Outcome');
ok(start !== -1 && end > start, 'the parser is where this test expects it');

const js = ts.transpileModule(
  src.slice(start, end).replace('export function', 'function')
    + '\nmodule.exports = { parseInviteList };',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { parseInviteList } = mod.exports;

const emails = (rows) => rows.filter((r) => !r.problem).map((r) => r.email);

// --- the shapes people actually paste ---------------------------------------
{
  const rows = parseInviteList('a@example.org\nb@example.org\nc@example.org');
  ok(emails(rows).join(',') === 'a@example.org,b@example.org,c@example.org',
     'one address per line');
}
{
  const rows = parseInviteList('a@example.org, b@example.org; c@example.org');
  ok(emails(rows).length === 3, 'commas and semicolons separate too');
}
{
  // What a mail client gives you when somebody copies a group.
  const rows = parseInviteList('Maria Santos <maria@example.org>\nJoe <joe@example.org>');
  ok(emails(rows).join(',') === 'maria@example.org,joe@example.org',
     'Name <address> yields the address');
  ok(rows[0].name === 'Maria Santos', 'and keeps the name for the greeting');
}
{
  // A spreadsheet column arrives tab-separated.
  const rows = parseInviteList('a@example.org\tb@example.org');
  ok(emails(rows).length === 2, 'tabs separate, so a pasted spreadsheet column works');
}

// --- CASE AND WHITESPACE, which is how one person becomes two ---------------
{
  const rows = parseInviteList('  Ruth@Example.ORG  ');
  ok(emails(rows)[0] === 'ruth@example.org', 'addresses are trimmed and lower-cased');
}
{
  const rows = parseInviteList('ruth@example.org\nRUTH@example.org');
  ok(emails(rows).length === 1, 'the same address in two cases is ONE invitation');
  ok(rows[1].problem === 'Listed twice', 'and the second line says why it was skipped');
}

// --- what must never reach a send -------------------------------------------
{
  const rows = parseInviteList('not an address\nreal@example.org\n\n   \nalso-bad@\n@nope.org');
  ok(emails(rows).join(',') === 'real@example.org',
     'only the real address is sendable');
  ok(rows.every((r) => r.problem || r.email === 'real@example.org'),
     'and every skipped line carries a reason rather than vanishing');
  // A dropped line is worse than a rejected one: nobody counts the ones that
  // are not there.
  ok(rows.length === 4, 'blank lines collapse but nothing else is silently dropped');
}
{
  ok(parseInviteList('').length === 0, 'empty input yields nothing rather than one blank row');
  ok(parseInviteList('   \n  \n').length === 0, 'and so does whitespace');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
