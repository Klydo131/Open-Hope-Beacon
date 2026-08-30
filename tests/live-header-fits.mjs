// The signed-in header has to fit on a phone, and there has to be a way home.
//
// WHY THIS IS A SOURCE TEST AND NOT A BROWSER ONE. Every other layout check in
// this project renders the real page. This one cannot: the live shell only
// exists behind a Supabase session, and the sandbox these run in cannot reach
// Supabase at all. A browser test would have to sign in, so it would either be
// skipped or -- worse -- pass by rendering the login screen and finding nothing
// wrong with it.
//
// So this asserts the structure that the bug was made of. An iOS user reported
// a tall empty strip down the right of every screen. That strip was the page
// being wider than the phone: the header packed the logo, five 44px section
// icons, a mode switch, a bell, an install chip, an avatar and a "Sign out"
// button into ONE non-wrapping row where nearly everything was `shrink-0`. At
// 390px that row needs roughly 600px, so it ran off the side and took the
// document's width with it.
//
// The sample-data shell had already hit this exact bug and fixed it -- a church
// director photographed an icon resting on top of the logo -- and the live
// shell simply never received the same treatment.

import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../components/LiveAppShell.tsx', import.meta.url), 'utf8');
const css   = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

let bad = 0;
const ok = (cond, msg) => { if (!cond) bad++; console.log(`${cond ? 'OK ' : 'BAD'} ${msg}`); };

// 1. A way home that reads as a button. The logo has always linked home, but a
//    logo is not a button to somebody who has never used the app.
ok(/icon="🏠"\s+label="Home"|label="Home"/.test(shell),
   'the live header has an explicit Home link');

// 2. The section strip must be able to scroll inside itself, so a long list can
//    never again push the page sideways.
ok(/overflow-x-auto/.test(shell),
   'the section nav scrolls within itself rather than widening the page');

// 3. The room links do not compete with the account controls. Below `xl` they
//    have a separate scrolling row; at `xl`, the left rail takes over.
ok((shell.match(/aria-label="Sections"/g) ?? []).length === 1,
   'the account row does not repeat the complete room navigation');
ok(/overflow-x-auto[^\n]*xl:hidden/.test(shell),
   'the separate room row stays available until the desktop rail appears');

// 4. "Sign out" is the widest single word in that row and it lives nowhere else
//    in the app, so it must survive as a symbol rather than be dropped.
ok(/aria-label="Sign out"/.test(shell),
   'sign out keeps an accessible name when its text is hidden');
ok(/hidden text-sm font-semibold sm:inline/.test(shell),
   'the words "Sign out" are hidden on phones, not the control itself');

// 5. The guard that makes any future overflow harmless on iOS.
//
//    `overflow-x: clip` on the body alone was the state that shipped. Chrome
//    and Android honour it; WebKit does not reliably, and where a declaration
//    is not understood it is dropped -- which is why this reproduced on iOS and
//    not on Android.
ok(/html\s*\{[^}]*overflow-x:\s*clip/s.test(css),
   'the root element clips horizontal overflow');
ok(/@supports not \(overflow: clip\)/.test(css),
   'there is a fallback for engines without `overflow: clip` (iOS Safari)');
ok(/@supports not \(overflow: clip\)\s*\{\s*html\s*\{\s*overflow-x:\s*hidden/s.test(css),
   'the fallback puts `hidden` on html, not body, so sticky headers keep sticking');

// ---------------------------------------------------------------------------
// EVERY ROOM ON THE RAILS IS ALSO IN THE HEADER.
// ---------------------------------------------------------------------------
// THE BUG THIS EXISTS FOR: "I need the lesson study editing features for guides
// to make their own lesson studies too, not just in mac or desktop."
//
// A Guide writes their own studies in the Office. The Office is on the rails,
// and the rails are `xl:block` — hidden below 1280px. So on every phone and
// every tablet the header row was the whole of the navigation, and it listed
// Church, Library, Profile and Settings. Office, Publish and Cases were rooms
// added after that list was written and never added to it.
//
// Nothing about the feature was missing; the door was. And nothing could have
// caught it, because the two lists are written in different files and neither
// knows the other exists. This is that check.
{
  const rails = readFileSync('components/RoomRails.tsx', 'utf8');

  // The rooms the rail offers, taken from its own link definitions.
  const railRooms = new Set(
    [...rails.matchAll(/href:\s*'(\/[a-z]+)'/g)].map((m) => m[1]),
  );
  // The rail's own dashboards are role-specific and the header reaches them
  // through its Home link, which uses homeFor(role).
  for (const own of ['/ds', '/dm', '/admin']) railRooms.delete(own);

  const headerRooms = new Set(
    [...shell.slice(shell.indexOf('const SECTIONS'), shell.indexOf('function ShellLink'))
      .matchAll(/href:\s*'(\/[a-z]+)'/g)].map((m) => m[1]),
  );

  const missing = [...railRooms].filter((r) => !headerRooms.has(r));
  ok(missing.length === 0,
    missing.length
      ? `these rooms are on the rails and NOT in the header, so they cannot be `
        + `reached on a phone or a tablet: ${missing.join(', ')}`
      : `every room on the rails is in the header too (${railRooms.size} rooms)`);
}

console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
