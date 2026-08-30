// Render all three invitations and look at what comes out.
//
// This composer runs in Deno inside an edge function, so nothing else in this
// repository ever executes it. That is exactly why it needs a test: a mistake
// here is invisible until a stranger being invited to a church receives a
// broken message, and by then the only person who can report it is the person
// we were trying not to confuse.
//
// It is transpiled and RUN rather than read as text. Checking the source for
// the string "Explorer" proves nothing about what a recipient sees; three real
// renders do.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const SRC = 'supabase/functions/invite/email.ts';
const js = ts.transpileModule(readFileSync(SRC, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { inviteHtml, subjectFor, roleWord } = mod.exports;

// All four. A role the composer does not cover renders as undefined and
// sends a blank message, which is exactly the failure this file exists for.
const ROLES = ['ds', 'dm', 'admin', 'executive'];
// A NEUTRAL HOST, deliberately. tests/no-backend.js forbids this deployment's
// hostname anywhere in the tree, because a fork that inherits it inherits a
// wrong address in a place nobody thinks to look. Any absolute URL proves the
// same property here.
const URL_ = 'https://church.example.org/join?token_hash=abc123&type=invite';
const APP_URL = 'https://church.example.org';
const CHURCH = 'Open Hope Beacon Demo Church';

// ---------------------------------------------------------------------------
// Every role renders, and renders differently.
// ---------------------------------------------------------------------------
const bodies = {};
for (const role of ROLES) {
  const html = inviteHtml(role, CHURCH, URL_, APP_URL);
  bodies[role] = html;
  ok(typeof html === 'string' && html.length > 800, `${role}: renders a real message`);

  // The link twice: a button that will not render is a dead end, a URL is not.
  const hrefs = (html.match(/href="https:\/\/church\.example\.org[^"]*"/g) || []).length;
  ok(hrefs >= 2, `${role}: the join link appears as both a button and copyable text`);

  // The install/use guidance must come before the one-time invitation. A
  // recipient should not trigger an account link before knowing which browser
  // to use and how the app arrives on their device.
  ok(html.includes('Safari on iPhone or iPad') && html.includes('Other browsers'),
     `${role}: gives separate Safari and other-browser install steps`);
  ok(html.includes('Using the app') && (html.includes('Guild Room') || (html.includes('Admin') && html.includes('Security'))),
     `${role}: explains how to return and use the right room after joining`);
  ok(html.indexOf('Safari on iPhone or iPad') < html.indexOf('Accept your invitation'),
     `${role}: places install help before the invitation link`);
  const invitationButton = html.lastIndexOf('Accept your invitation');
  const fallback = html.lastIndexOf('If the button does not work');
  ok(invitationButton >= 0 && invitationButton < fallback
     && html.slice(fallback).includes('token_hash=abc123'),
     `${role}: keeps the fallback invitation URL at the bottom`);
  ok(html.includes(`href="${APP_URL}"`), `${role}: install links use the ordinary app address, never the one-time link`);

  ok(html.includes(CHURCH), `${role}: names the church`);
  ok(html.includes(roleWord(role)), `${role}: says which role they were invited as`);

  // NOTHING UNSUBSTITUTED MAY REACH A READER. The whole point of composing here
  // rather than in a template engine is that no placeholder syntax survives.
  ok(!/\{\{|\}\}|\{%/.test(html), `${role}: no template placeholder survives into the message`);
}

// The three must actually differ. A shared shell is fine; identical bodies are
// the bug this whole file exists to prevent.
ok(bodies.ds !== bodies.dm && bodies.dm !== bodies.admin && bodies.ds !== bodies.admin,
   'the three roles produce three different messages');

// ---------------------------------------------------------------------------
// Subjects differ, and that is not cosmetic.
// ---------------------------------------------------------------------------
// Gmail threads by subject and collapses a later message behind "Show quoted
// text" when it resembles an earlier one in the thread. Two invitations to one
// person then read as one invitation and one blank message -- which is exactly
// what happened here and cost a morning.
const subjects = ROLES.map(subjectFor);
ok(new Set(subjects).size === ROLES.length,
   'each role has its own subject, so Gmail cannot collapse one into another');
ok(subjects.every((s) => s && s.length > 8), 'no subject is empty or a stub');

// ---------------------------------------------------------------------------
// A church name from the database is escaped.
// ---------------------------------------------------------------------------
// churches.name is set by an Executive Director, so it is not attacker-supplied
// in the usual sense -- but it is user input reaching an HTML document, and the
// cost of being wrong is a broken or hostile email sent to a congregation.
const nasty = inviteHtml('ds', 'St <script>alert(1)</script> "Mary" & Co', URL_, APP_URL);
ok(!nasty.includes('<script>'), 'a church name cannot inject a tag');
ok(nasty.includes('&lt;script&gt;'), 'the angle brackets are escaped rather than dropped');
ok(nasty.includes('&quot;Mary&quot;') && nasty.includes('&amp; Co'),
   'quotes and ampersands are escaped too, so the markup around them cannot break');

// ---------------------------------------------------------------------------
// The empty church name still reads as a sentence.
// ---------------------------------------------------------------------------
// A church row with no name is a real state during setup, and "  has invited
// you" is the kind of thing that ships because nobody rendered the blank case.
const blank = inviteHtml('ds', '', URL_, APP_URL);
ok(blank.includes('Your church'), 'a missing church name falls back to readable words');
ok(!/>\s*has invited you/.test(blank.replace(/<strong[^>]*>[^<]*<\/strong>/g, 'X')),
   'and never leaves a sentence starting mid-air');

// ---------------------------------------------------------------------------
// Email clients: tables and inline styles only.
// ---------------------------------------------------------------------------
for (const role of ROLES) {
  const html = bodies[role];
  ok(!/<style[\s>]/i.test(html), `${role}: no <style> block, which several clients drop`);
  ok(!/display:\s*(flex|grid)/i.test(html), `${role}: no flexbox or grid, which Outlook cannot lay out`);
  ok(!/<img[\s>]/i.test(html), `${role}: no image, which most clients block by default`);
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
