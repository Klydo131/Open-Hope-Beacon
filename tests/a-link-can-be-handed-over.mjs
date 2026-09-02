// A Director can get the join link instead of emailing it.
//
// WHY THIS EXISTS. An emailed invitation carries a one-time token, and the
// address it points at spends that token on any fetch. A mail scanner, a
// corporate filter or a phone drawing a preview opens it first, and the invited
// person is told their link expired on their very first tap. The templates now
// avoid that, but templates are pasted into a dashboard by hand, and a church
// on a demo deadline needs a route that depends on nothing being pasted
// anywhere. Nothing is emailed on this route, so there is nothing to intercept.
//
// THE RULE IT MUST NOT BREAK. auth.users holds ONE token slot per purpose.
// Minting a second token overwrites the first, so a link minted AFTER a message
// has gone kills the link inside that message. Every invitation, every person.
// This route obeys that by sending nothing at all: one mint, one token, and the
// Director is told plainly that no email went.
//
//   node tests/a-link-can-be-handed-over.mjs
//
// Reads the source. Needs no database and sends nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// ---- The function ----
const fn = stripComments(read('supabase/functions/invite/index.ts'));

ok(/deliver\?: string/.test(fn), 'the function accepts a delivery choice');
ok(/const handOver = body\.deliver === 'link'/.test(fn), 'and reads it as an explicit request');

// The branch has to come BEFORE both mailers, not filter them afterwards.
const handAt = fn.indexOf('if (handOver)');
const brevoAt = fn.indexOf('} else if (brevoKey)');
const inviteMailAt = fn.indexOf('inviteUserByEmail');
ok(handAt > -1 && brevoAt > handAt, 'it is decided before the Brevo path is entered');
ok(handAt > -1 && inviteMailAt > handAt, 'and before Supabase Auth is asked to send anything');
ok(/} else if \(brevoKey\)/.test(fn),
   'the mailers are the OTHER branches, so no message can leave on this route');

// ---- The one-token rule, still intact ----
//
// Two mint sites exist and both are correct: the Brevo path mints instead of
// sending, and the fallback mints only when nothing was sent. A third, on the
// success path, is the bug that broke every invitation this app posted.
const mints = (fn.match(/auth\.admin\.generateLink/g) || []).length;
ok(mints === 4, `there are still exactly four generateLink calls, in two guarded pairs (found ${mints})`);
ok(/if \(sendError && !joinUrl\)/.test(fn),
   'the fallback still mints only when no message went');

// The reply on the path where mail DID go must carry no link.
const emailReply = fn.slice(fn.lastIndexOf("delivery: 'email'"));
ok(!/link:/.test(emailReply.slice(0, emailReply.indexOf('}'))),
   'a successful send still returns no link, because minting one would kill it');

// ---- The way in ----
const data = stripComments(read('lib/live/data.ts'));
const invite = data.slice(data.indexOf('export async function inviteMember'));
ok(/deliver\?: 'email' \| 'link'/.test(invite.slice(0, 900)), 'the client can ask for it');
ok(/deliver,/.test(invite.slice(0, 1600)), 'and passes it through to the function');

// ---- The screen ----
const screen = read('components/LiveChurchPages.tsx');
ok(/resend\(i, 'link'\)/.test(screen), 'a Director has a control that asks for the link');
ok(/Get a link to send myself/.test(screen), 'named for what it does, not for how it works');
// The panel that opens must warn, because this mint switches off whatever was
// already sent to that person.
ok(/only works\s*\n?\s*once/.test(screen) || /works once/.test(screen),
   'and the panel says the link works once');
ok(/Do not open it yourself/.test(screen),
   'and warns the Director not to open it, which would spend it and sign them out');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
