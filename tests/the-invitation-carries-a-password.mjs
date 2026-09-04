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
  // It names where to go. An instruction with no destination is a complaint.
  ok(/Settings/.test(mail) && /Change password/.test(mail),
     'and names the screen that does it');
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

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
