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
// NO LONGER A TOKEN. The invitation carries a password, so the address in the
// message is the ordinary sign-in page with the person's own e-mail in it.
const URL_ = 'https://church.example.org/login?email=someone%40example.org';
const APP_URL = 'https://church.example.org';
const CHURCH = 'Open Hope Beacon Demo Church';
const SIGN_IN_EMAIL = 'someone@example.org';
const TEMP_PASSWORD = 'coral-anchor-cedar-482';

// ---------------------------------------------------------------------------
// Every role renders, and renders differently.
// ---------------------------------------------------------------------------
const bodies = {};
for (const role of ROLES) {
  const html = inviteHtml(role, CHURCH, URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD);
  bodies[role] = html;
  ok(typeof html === 'string' && html.length > 800, `${role}: renders a real message`);

  // The link twice: a button that will not render is a dead end, a URL is not.
  const hrefs = (html.match(/href="https:\/\/church\.example\.org[^"]*"/g) || []).length;
  ok(hrefs >= 2, `${role}: the join link appears as both a button and copyable text`);

  ok(html.includes('Safari on iPhone or iPad') && html.includes('Other browsers'),
     `${role}: gives separate Safari and other-browser install steps`);
  ok(html.includes('Using the app') && (html.includes('Guild Room') || (html.includes('Admin') && html.includes('Security'))),
     `${role}: explains how to return and use the right room after joining`);

  // THE INVITATION COMES BEFORE THE INSTALL STEPS, and this assertion used to
  // say the opposite.
  //
  // The old reasoning was that a recipient should not spend a one-time link
  // before knowing which browser to use. It reads sensibly and it was wrong,
  // because of what people did with it: they followed the install steps first,
  // and an installed app opens as a fresh session with no invitation in it.
  // Some never came back to the email. One Guide finished with an account that
  // had no password and a spent link, and it had to be repaired by hand against
  // the database.
  //
  // Accepting is the only step that expires, works once, and cannot be done
  // later from anywhere else. Installing has no deadline and is explained inside
  // the app. So the thing with a deadline goes first.
  ok(html.indexOf('Sign in to Hope Beacon') < html.indexOf('Safari on iPhone or iPad'),
     `${role}: puts signing in before the install steps`);
  ok(html.indexOf('Sign in to Hope Beacon') < html.indexOf('Next: install Hope Beacon'),
     `${role}: and the install section presents itself as what comes next`);
  // The copyable address stays immediately under the button it backs up, which
  // is no longer the bottom of the message. A button that will not render in
  // somebody's mail client is a dead end; a URL beside it is not.
  //
  // MEASURED AS A DISTANCE, not just an order. The first version of this check
  // asked only that the copyable address came somewhere after the button, and
  // it passed happily while the reorder left that address stranded at the very
  // bottom of the message, below every install step. Order alone cannot tell
  // "underneath the button" from "elsewhere in the email".
  const invitationButton = html.indexOf('Sign in to Hope Beacon');
  const fallback = html.indexOf('If the button does not work');
  ok(invitationButton >= 0 && fallback > invitationButton && fallback - invitationButton < 500,
     `${role}: the copyable address sits directly under the button (${fallback - invitationButton} chars away)`);
  ok(html.slice(fallback, fallback + 500).includes('login?email='),
     `${role}: and it is the sign-in address, not the app home`);
  ok(html.includes(`href="${APP_URL}"`), `${role}: install links use the ordinary app address`);

  // -------------------------------------------------------------------------
  // THE CREDENTIALS, IN THE RENDERED MESSAGE, ABOVE THE BUTTON
  // -------------------------------------------------------------------------
  //
  // "That email and password must be emphasized first before tapping the accept
  // or join in to the Web app." Checked on the real render rather than on the
  // source, because that is what a person receives. tests/the-invitation-carries
  // -a-password.mjs reads the source; this one runs it, and this file exists
  // precisely because reading proves nothing about what comes out.
  //
  // THIS SUITE IS ALSO WHAT CAUGHT THE SIGNATURE CHANGE. When inviteHtml gained
  // two parameters, the source-reading test still passed and this one threw on
  // the first render -- undefined reaching esc(). A rendering test earns its
  // keep on exactly that class of mistake.
  ok(html.includes(SIGN_IN_EMAIL), `${role}: shows the address they sign in with`);
  ok(html.includes(TEMP_PASSWORD), `${role}: and the password itself`);
  ok(html.indexOf(SIGN_IN_EMAIL) < invitationButton
     && html.indexOf(TEMP_PASSWORD) < invitationButton,
     `${role}: both appear ABOVE the button, which is the whole request`);
  ok(html.includes('Step 1') && html.includes('Step 2')
     && html.indexOf('Step 1') < html.indexOf('Step 2'),
     `${role}: and the two steps are numbered in order`);

  // The warning has to travel with the password, not sit in a footer.
  const warn = html.indexOf('This password is temporary');
  ok(warn > 0 && warn < invitationButton,
     `${role}: the temporary-password warning sits with the password`);
  ok(html.includes('Settings') && html.includes('Change password'),
     `${role}: and names the screen that changes it`);

  // Nothing may still promise a one-time link. A false reassurance about
  // expiry is how somebody decides not to bother today.
  ok(!/works\s*<strong>once<\/strong>/.test(html) && !html.includes('link works once'),
     `${role}: nothing claims the link works only once any more`);

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
const nasty = inviteHtml('ds', 'St <script>alert(1)</script> "Mary" & Co', URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD);
ok(!nasty.includes('<script>'), 'a church name cannot inject a tag');
ok(nasty.includes('&lt;script&gt;'), 'the angle brackets are escaped rather than dropped');
ok(nasty.includes('&quot;Mary&quot;') && nasty.includes('&amp; Co'),
   'quotes and ampersands are escaped too, so the markup around them cannot break');

// AND SO ARE THE CREDENTIALS. The generator only makes lowercase words, digits
// and hyphens, so nothing dangerous can reach here today -- which is exactly
// the reasoning that stops being true the day somebody changes the generator.
// The escaping is what makes that change safe rather than a surprise.
{
  const odd = inviteHtml('ds', CHURCH, URL_, APP_URL,
    'a<b>@example.org', 'pass"&<word>-123');
  ok(!odd.includes('<b>@example.org'), 'an address with a tag in it cannot inject one');
  ok(odd.includes('&lt;word&gt;') && odd.includes('&quot;'),
     'and a password with markup characters is escaped, not rendered');
}

// ---------------------------------------------------------------------------
// The empty church name still reads as a sentence.
// ---------------------------------------------------------------------------
// A church row with no name is a real state during setup, and "  has invited
// you" is the kind of thing that ships because nobody rendered the blank case.
const blank = inviteHtml('ds', '', URL_, APP_URL, SIGN_IN_EMAIL, TEMP_PASSWORD);
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

// ---------------------------------------------------------------------------
// The message matches who is actually let straight in.
// ---------------------------------------------------------------------------
//
// `handle_new_user` approves an arriving account automatically only when the
// invited role is Explorer or Executive Director. A Guide or a Director signs
// in with the password that worked, and meets "Your account is not approved
// yet" -- while the message they are holding says there is nothing to set up.
//
// That reads as a broken password, which is the one thing this whole change
// exists to stop somebody believing. So the two roles that wait are told they
// wait, and the two that do not are NOT told, because for them it is untrue and
// an invented delay costs the same trust in the other direction.
{
  const WAITS = /A Director then lets you in/;
  for (const role of ['dm', 'admin']) {
    ok(WAITS.test(bodies[role]),
       `${role}: is told a Director still has to let them in, because they are not approved on arrival`);
  }
  for (const role of ['ds', 'executive']) {
    ok(!WAITS.test(bodies[role]),
       `${role}: is NOT told to wait, because they are approved the moment they sign in`);
  }
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
