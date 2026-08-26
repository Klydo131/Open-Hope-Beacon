// Staying signed in until you sign out.
//
// THE BUG THIS EXISTS FOR: "Your account is not ready. JWT expired."
//
// A Supabase access token lasts ONE HOUR. A refresh token lasts months and is
// what turns that into staying signed in on a device. Nothing here ever used
// the refresh token, so every member was signed out an hour after signing in
// and told their account was not ready, which is not what had happened.
//
// WHY THE CHECK IS ON THE SOURCE. The failure is a timing one: it needs a real
// token, a real hour and a real Supabase to reproduce, and by the time a
// browser test could see it the person is already signed out. What can be
// checked here are the four properties that make the refresh correct, each of
// which is a way this has gone wrong in real applications.

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const CLIENT = 'lib/supabase/client.ts';
const raw = readFileSync(CLIENT, 'utf8');

// Comments blanked, so prose describing a rule cannot satisfy it.
let inBlock = false;
const code = raw.split('\n').map((line) => {
  if (inBlock) { if (line.includes('*/')) inBlock = false; return ''; }
  if (/^\s*\/\//.test(line)) return '';
  if (/^\s*\/\*/.test(line)) { if (!line.includes('*/')) inBlock = true; return ''; }
  return line;
}).join('\n');

// ---------------------------------------------------------------------------
// 1. The refresh token is actually used.
// ---------------------------------------------------------------------------
ok(/grant_type=refresh_token/.test(code),
   'the client exchanges the refresh token for a new session');
ok(/refresh_token:\s*session\.refresh_token/.test(code),
   'and sends the stored refresh token to do it');

// ---------------------------------------------------------------------------
// 2. The data client asks for a token that will still be valid.
// ---------------------------------------------------------------------------
// The whole bug was `accessToken: () => readBrowserSession()?.access_token`,
// which hands over whatever was written at sign-in, forever.
ok(/accessToken:\s*liveAccessToken/.test(code),
   'the data client asks liveAccessToken, not the stored token directly');
ok(!/accessToken:\s*async\s*\(\)\s*=>\s*readBrowserSession\(\)/.test(code),
   'and never goes back to handing over the stored token unchecked');

// ---------------------------------------------------------------------------
// 3. ONE REFRESH AT A TIME.
// ---------------------------------------------------------------------------
// Supabase ROTATES the refresh token on every use. A page load fires several
// requests at once; two concurrent refreshes mean the second presents a token
// the first already spent, is refused, and the person is signed out by the code
// meant to keep them in. A shared in-flight promise is the whole defence.
{
  ok(/let\s+refreshing/.test(code), 'there is a single in-flight refresh');
  ok(/if\s*\(refreshing\)\s*return\s+refreshing;/.test(code),
     'and a second caller waits on it rather than starting another');
  const fn = code.slice(code.indexOf('function refreshBrowserSession'));
  ok(fn.indexOf('if (refreshing) return refreshing;') < fn.indexOf('fetch('),
     'the guard comes BEFORE the request, which is the only place it helps');
}

// ---------------------------------------------------------------------------
// 4. Expiry is read from the token, not from the stored field.
// ---------------------------------------------------------------------------
// `expires_at` is written by whatever produced the session, and this app's
// comes from its own sign-in route. The `exp` claim inside the token is the
// only copy the server enforces.
ok(/function tokenExpiry/.test(code), 'expiry is read from the token itself');
ok(/\.split\('\.'\)\[1\]/.test(code) && /exp/.test(code),
   'by decoding the exp claim rather than trusting expires_at');
ok(/REFRESH_MARGIN_SECONDS/.test(code),
   'with margin, so a token cannot expire between the check and the request');

// ---------------------------------------------------------------------------
// 5. A network failure is not a sign-out.
// ---------------------------------------------------------------------------
// Being offline must never log a congregation out. Only the server SAYING the
// session is over ends it.
{
  const fn = code.slice(code.indexOf('function refreshBrowserSession'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  ok(/res\.status === 400 \|\| res\.status === 401/.test(body),
     'a refused refresh (400 or 401) clears the session');
  const catchBlock = body.slice(body.lastIndexOf('} catch'));
  ok(!/clearBrowserSession/.test(catchBlock),
     'but a thrown request, which is what being offline looks like, does NOT');
}

// ---------------------------------------------------------------------------
// 6. The dead-end screen is gone.
// ---------------------------------------------------------------------------
// "Your account is not ready. JWT expired." above a Sign out button: their
// account was fine, they do not know what a JWT is, and the only offered
// action was the one they did not want.
{
  const session = readFileSync('lib/live/session.tsx', 'utf8');
  ok(/jwt\|expired/i.test(session),
     'an expired session is recognised in the session provider');
  ok(/live\.signOut\(\)/.test(session) && /setError\(''\)/.test(session),
     'and shows the sign-in screen instead of naming the mechanism');
  ok(/visibilitychange/.test(session),
     'and coming back to the app re-checks, so a phone left overnight works');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
