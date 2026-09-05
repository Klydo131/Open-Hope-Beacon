// The invitation carries an account somebody can sign in to, not a link that dies.
//
// WHAT WAS ASKED FOR. "We can make the email invitation have a faster process.
// How about we make the invitation with account with password already... That
// email and password must be emphasized first before tapping the accept or join
// in to the Web app. Once the user read the email and password, they are ready
// to tap or click the app."
//
// WHAT IT REPLACES, AND WHY IT IS THE RIGHT TRADE. `auth.users` holds ONE
// confirmation token and ONE recovery token -- single slots, not a list. Every
// path that minted a second token silently killed the one already sitting in
// somebody's inbox. On top of that, a one-time link is spent by whatever opens
// it first, which on most mail systems is a scanner rather than a person, and
// it expires on a clock nobody invited to a church app knows about. Twenty-three
// people were stuck at once, each holding an account with no password and a
// link that had already been used.
//
// A password has none of those failure modes. It does not expire, is not
// consumed by being read, survives being forwarded and tapped twice, and can be
// read aloud to somebody helping an older member get set up.
//
// THE COST, WHICH IS REAL. Anybody who can read that inbox can sign in, and it
// stays true until the password is changed. The answer is the wording in the
// email, a place in the app to change it, and a reminder that keeps asking --
// all three checked below, because the trade is only defensible if all three
// actually exist.
//
//   node tests/the-invitation-carries-a-password.mjs
//
// Reads the function, the mail and the screens. Needs no database.
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

// Comments are stripped before anything is matched. These files explain the
// bugs they fix at length, and a check that cannot tell an explanation from the
// thing it explains fails on its own documentation.
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

const fn = strip(read('supabase/functions/invite/index.ts'));
const mailSrc = read('supabase/functions/invite/email.ts');
const mail = strip(mailSrc);

// ---------------------------------------------------------------------------
// 1. THE ACCOUNT IS READY BEFORE THE MESSAGE LEAVES
// ---------------------------------------------------------------------------
ok(/firstPassword\(\)/.test(fn), 'the function makes a password');
ok(/createUser\(\{/.test(fn), 'and creates the account with it');
ok(/updateUserById\(/.test(fn), 'or sets one on an account an earlier invitation made');
ok(/email_confirm: true/.test(fn),
   'and confirms the address, because the church vouching for it is the point of an invitation');

// ORDER IS NOT INTERCHANGEABLE. `handle_new_user` fires on the auth.users
// insert and reads public.invites BY EMAIL for the role, church and Guide.
// Create the account first and the person arrives with no church and no role.
{
  const rowAt = fn.indexOf(".from('invites')");
  const userAt = fn.indexOf('createUser({');
  ok(rowAt !== -1 && userAt !== -1 && rowAt < userAt,
     'the invitation row is written BEFORE the account, or the person arrives with no church');
}

// ---------------------------------------------------------------------------
// 2. NOTHING MINTS A TOKEN ANY MORE
// ---------------------------------------------------------------------------
//
// This is the whole class of bug being removed, so it is checked as an absence
// rather than trusted to stay gone.
ok(!/generateLink\(/.test(fn),
   'no one-time token is minted anywhere in the function');
ok(/\/login\?email=/.test(fn), 'the address in the message is the ordinary sign-in page');
ok(/encodeURIComponent\(email\)/.test(fn), 'with the address escaped into it properly');

// ---------------------------------------------------------------------------
// 3. THE CREDENTIALS COME FIRST, WHICH IS THE LITERAL REQUEST
// ---------------------------------------------------------------------------
//
// "That email and password must be emphasized first before tapping the accept
// or join in to the Web app." Somebody who taps first and reads second arrives
// at a sign-in box holding nothing, goes back to the mail, and half of them do
// not come back.
{
  ok(/signInEmail: string/.test(mail) && /tempPassword: string/.test(mail),
     'the mail is given the address and the password to show');
  const emailAt = mail.indexOf('${who}');
  const passAt = mail.indexOf('${pass}');
  const buttonAt = mail.indexOf('Sign in to Hope Beacon');
  ok(emailAt !== -1, 'the address is printed in the message');
  ok(passAt !== -1, 'and so is the password');
  ok(buttonAt !== -1, 'and there is a button to open the app');
  ok(emailAt < buttonAt && passAt < buttonAt,
     'and BOTH appear above the button, not below it');

  // Numbered, so the reader is told there is an order rather than left to
  // infer one from layout that their mail client may not preserve.
  ok(/Step 1/.test(mail) && /Step 2/.test(mail), 'the two steps are numbered');
  ok(mail.indexOf('Step 1') < mail.indexOf('Step 2'), 'in that order');

  // A password in a wall of grey text is a password somebody scrolls past.
  const box = mailSrc.slice(mailSrc.indexOf('Step 1'), mailSrc.indexOf('Step 2'));
  ok(/monospace/.test(box), 'the credentials are set in a monospaced face, so nothing is ambiguous');
  ok(/border:2px solid/.test(box), 'in a box that cannot be mistaken for body text');
}

// ---------------------------------------------------------------------------
// 4. THE WARNING IS STRONG, AND STILL THEIR CHOICE
// ---------------------------------------------------------------------------
//
// "Give strong note to change the password... but if they dont change the
// password from the email, it's up to the user." So this urges, and nothing
// anywhere refuses to work until they comply.
{
  ok(/This password is temporary/.test(mail), 'the message says the password is temporary');
  ok(/change it/i.test(mail), 'and asks them to change it');
  ok(/Anybody who can read this/i.test(mail), 'and says plainly why it matters');
  ok(mail.indexOf('This password is temporary') < mail.indexOf('Sign in to Hope Beacon'),
     'and the warning sits with the password, not in a footer nobody reaches');
  // IT NAMES A PLACE. An instruction with no destination is a complaint, and
  // for a while the destination was the best that existed: a card inside a
  // folder inside Settings, reachable only through a hash. Reported as
  // confusing, and fairly -- a task people are SENT to needs an address. The
  // form lives at /password now and the message links to it.
  ok(/\/password/.test(mail), 'and names the page that does it');
  ok(/<a href="\$\{app\}\/password"/.test(mail),
     'as a link built from the app’s own address, not a hard-coded host');
}

// ---------------------------------------------------------------------------
// 5. THE APP CAN ACTUALLY DO WHAT THE MESSAGE TELLS THEM TO DO
// ---------------------------------------------------------------------------
//
// Until today there was NOWHERE in the app to change a password. The only route
// was signing out and pressing "Forgot your password", which is a strange thing
// to ask of somebody who has forgotten nothing. Telling people to do a thing
// the app cannot do is worse than never mentioning it.
{
  const data = strip(read('lib/live/data.ts'));
  ok(/export async function changeMyPassword/.test(data), 'there is a way to change your own password');
  const body = data.slice(data.indexOf('export async function changeMyPassword'));
  const fnBody = body.slice(0, body.indexOf('\nexport ', 1));
  ok(/auth\.updateUser\(\{ password/.test(fnBody), 'which really changes it');
  ok(/length < 10/.test(fnBody), 'and holds the same ten-character rule as signing up');
  ok(/saveBrowserSession/.test(fnBody),
     'and re-saves the session, because changing a password rotates the tokens');
  ok(/password_is_temporary: false/.test(fnBody), 'and clears the reminder');

  const ui = strip(read('components/LiveAccountPages.tsx'));
  ok(/live\.changeMyPassword\(/.test(ui), 'a screen calls it');
  ok(/Change your password/.test(ui), 'under a heading that says so');
  ok(/id="password"/.test(ui), 'at an anchor the e-mail and the reminder can link to');
  ok(/Show what I am typing/.test(ui),
     'and it can be shown while typing, which is where older members give up');
}

// ---------------------------------------------------------------------------
// 6. THE REMINDER EXISTS AND IS A NUDGE, NOT A GATE
// ---------------------------------------------------------------------------
{
  const dir = 'supabase/migrations';
  const file = fs.readdirSync(path.join(root, dir))
    .filter((f) => f.includes('the_first_password_is_temporary')).sort().pop();
  ok(!!file, `the migration is present (${file ?? 'MISSING'})`);
  const sql = file ? read(`${dir}/${file}`) : '';
  ok(/add column if not exists password_is_temporary boolean not null default false/.test(sql),
     'the flag exists and defaults to off');
  // Nobody already in the church is retro-flagged: they all chose their own
  // password months ago through the old sign-up form.
  ok(!/update public\.profiles set password_is_temporary = true/i.test(sql),
     'and nobody already in the church is flagged for something they did months ago');

  ok(/password_is_temporary: true/.test(fn), 'the invitation sets it');
  const ui = strip(read('components/LiveAccountPages.tsx'));
  ok(/password_is_temporary === true/.test(ui), 'the screen reads it');
  ok(/still using the password from your invitation/i.test(ui), 'and says so in plain words');
}

// ---------------------------------------------------------------------------
// 7. THE DIRECTOR CAN READ IT DOWN A PHONE LINE
// ---------------------------------------------------------------------------
//
// This is the call that used to end in "I'll send you another one" -- which,
// while invitations carried a one-time token, killed the message already
// sitting in that person's inbox.
{
  ok(/signInEmail: email/.test(fn) && /tempPassword,/.test(fn),
     'the reply carries the address and the password');
  const admin = strip(read('components/live/AdminPage.tsx'));
  ok(/result\.tempPassword/.test(admin), 'the Director’s screen keeps them');
  ok(/handLink\.pass/.test(admin), 'and draws them');
  ok(/font-mono/.test(admin), 'in a monospaced face, so nothing is misread aloud');
}

// ---------------------------------------------------------------------------
// 8. THE SIGN-IN PAGE MEETS THEM HALF WAY
// ---------------------------------------------------------------------------
{
  const door = strip(read('components/live/DoorPages.tsx'));
  ok(/params\.get\('email'\)/.test(door),
     'the address from the invitation is already in the box');
  ok(/toLowerCase\(\)/.test(door.slice(door.indexOf("params.get('email')"), door.indexOf("params.get('email')") + 200)),
     'lower-cased, because addresses are and thumbs are not');
}

// ---------------------------------------------------------------------------
// 9. THE FOOTER DOES NOT PROMISE SOMETHING THAT STOPPED BEING TRUE
// ---------------------------------------------------------------------------
//
// While an invitation carried a one-time link, the account did not exist until
// somebody opened it, so "you can ignore this message and no account will be
// used" was accurate. Creating the account BEFORE the message leaves made that
// sentence false, and nothing anywhere pinned it -- it survived the rewrite and
// rendered wrong in the first picture anybody actually looked at.
//
// It matters more than a wording slip. Somebody who was not expecting the
// message is being told there is nothing to act on, while an account with a
// working password sits at their address. The footer has to say what is true
// and give them a way to undo it.
{
  ok(!/no account will be used/.test(mail),
     'the footer no longer claims no account exists, because by then one does');
  ok(/an account was created for you/.test(mail),
     'it says plainly that one was made');
  ok(/remove the account/.test(mail),
     'and gives somebody who did not want it a way out');
}

// ---------------------------------------------------------------------------
// 10. TAPPING THE BUTTON SIGNS THEM IN
// ---------------------------------------------------------------------------
//
// THE ASK: "Make sure when the new explorer clicks, they are logged in (so they
// can have the logic to change the password, if not then they will have the
// temporary password)" -- then, immediately: "Not just explorers I mean, but
// new users (EDs, D, Gs, and Es)." So it is every invited role, and the check
// is on the door rather than on anything role-shaped.
//
// THE FRAGMENT IS THE WHOLE SAFETY ARGUMENT. Everything after `#` is stripped
// by the browser before the request is built: not in the address the server
// receives, not in an access log, not in a proxy's records, not in a Referer
// header handed to anything the page later loads. A `?p=` would be in all five,
// and would be the kind of mistake that is invisible until somebody reads a log
// a year later. This checks the fragment is used AND that a query parameter
// never creeps back in.
{
  ok(/#p=\$\{encodeURIComponent\(tempPassword\)\}/.test(fn),
     'the address in the message carries the password in the fragment');
  ok(!/[?&]p=\$\{/.test(fn),
     'and never as a query parameter, which servers and proxies would record');

  // The printed fallback address must NOT carry it: somebody pasting that line
  // into a chat to ask for help would paste their password with it.
  ok(/joinUrl\.split\('#'\)\[0\]/.test(mail),
     'the printed fallback address has the password stripped out of it');
  ok(/href="\$\{plainUrl\}"[^>]*>\$\{plainUrl\}/.test(mail),
     'and it is the stripped one that is shown and linked');
  ok(/<a href="\$\{url\}"/.test(mail), 'while the button keeps the full address');

  const door = strip(read('components/live/DoorPages.tsx'));
  ok(/hash\.startsWith\('#p='\)/.test(door), 'the sign-in page notices somebody arriving from an invitation');
  ok(/live\.signIn\(email, handed\)/.test(door), 'and signs them in with what it was handed');

  // ORDER MATTERS, AND IT IS NOT COSMETIC. The address bar must be cleaned
  // BEFORE the network call, or the password sits on screen for as long as the
  // connection is slow -- which on a phone in a church hall is the normal case,
  // not the edge one.
  const cleaned = door.indexOf('window.history.replaceState');
  const signedIn = door.indexOf('live.signIn(email, handed)');
  ok(cleaned !== -1, 'it takes the password out of the address bar');
  ok(cleaned < signedIn, 'and does that BEFORE it starts signing in, not after');

  // Once only. Re-running on every state change would be a login storm.
  ok(/arrived\.current/.test(door), 'and it runs once rather than on every render');

  // A stale password (they changed it, then tapped the old mail) must land them
  // at the ordinary form, not at a dead end.
  ok(/Please type the password from your invitation e-mail below/.test(door),
     'and a password that no longer works leaves them at the form, not stuck');

  // A Guide or Director arriving this way is signed in but not yet approved.
  ok(/waiting for a Director to approve it/.test(door),
     'somebody not yet approved is told why, rather than bounced');
}

// ---------------------------------------------------------------------------
// 11. CHANGING IT IS A PLACE, NOT A CARD SOMEWHERE
// ---------------------------------------------------------------------------
//
// REPORTED: "The change your password should have their own page, users get
// confuse why there isn't a dedicated page for new password and it's the same
// page for home."
//
// The complaint is about addressability, and it is correct. Changing a password
// is a task people are SENT to -- by this e-mail, by the reminder in the app, by
// a Director on the phone. A task you are sent to needs somewhere to be sent.
// It was a card, inside a folder, inside Settings, reachable only by a hash
// that had to be translated into a folder name first; so the instruction could
// never be a place, only directions.
{
  const route = 'app/password/page.tsx';
  const there = fs.existsSync(path.join(root, route));
  ok(there, 'there is a page at /password');
  // READ ONLY IF IT IS THERE. Reading it unconditionally made this suite THROW
  // when the page was missing, so the four checks below never ran and the one
  // failure that did print was the only thing anybody saw. A test that crashes
  // on the fault it exists to describe reports less than it knows.
  const page = there ? strip(read(route)) : '';
  ok(/LivePasswordPage/.test(page), 'and it draws the password form');
  ok(/LiveAppShell/.test(page), 'behind the same sign-in wall as every other live page');
  ok(/'executive', 'admin', 'dm', 'ds'/.test(page),
     'and every role may reach it, Executive Directors included');

  const ui = strip(read('components/LiveAccountPages.tsx'));
  ok(/export function LivePasswordPage/.test(ui), 'the page is a real component');

  // THE FORM IS IN ONE PLACE ONLY. Two working password forms is two places to
  // change one rule and one of them to forget.
  const settingsAt = ui.indexOf("room === 'account'");
  const settingsBlock = ui.slice(settingsAt, settingsAt + 1600);
  ok(!/<PasswordCard \/>/.test(settingsBlock),
     'Settings no longer holds a second copy of the form');
  ok(/href="\/password"/.test(settingsBlock),
     'it points at the page instead, so the old route still arrives somewhere sensible');

  // A page somebody lands on from an e-mail needs a way out that goes where
  // they actually live, not back to a screen they have never opened.
  const pageBody = ui.slice(ui.indexOf('export function LivePasswordPage'));
  ok(/homeFor\(profile\.role\)/.test(pageBody.slice(0, 900)),
     'and leaving it goes to their own home, not to Settings they never visited');
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
