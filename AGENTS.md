# AGENTS.md — working brief for Open Hope Beacon

Two agents work in this repository, Claude and Codex, usually not at the same
time and never with the same context. Everything below exists because one of us
learned it the hard way and the other could not have known.

**This file is the shared map.** [`CLAUDE.md`](./CLAUDE.md) adds nothing but a
pointer back here. Human contributors want [`CONTRIBUTING.md`](./CONTRIBUTING.md)
first; this file is the part that only matters if you are editing the app.

---

## 0. This repository is public

It is AGPL-3.0 and anyone can read it, including everything you write in a
commit message, a test fixture or a comment.

Nothing that identifies a real member of a real church belongs in a tracked
file. No names, no email addresses, no photographs, no backend project
identifiers, no database dumps, no counts small enough to point at a person.
When a live check informs a decision, write down **what you learned**, not the
row it came from.

`tests/no-secrets.js` catches credentials of recognisable shape. It cannot catch
a name, and it is not trying to. That part is yours.

---

## 1. The app is two apps behind one door

`useIsLive()` decides which. Almost every route renders one of two trees:

```tsx
if (useIsLive()) return <LiveAppShell allow={...}>…</LiveAppShell>;
return <AppShell allow={...}>…</AppShell>;
```

| | Sample side | Live side |
|---|---|---|
| State | `lib/demo/store.tsx`, seeded from `lib/demo/seed.ts` | Supabase |
| Data access | the store | `lib/live/data.ts` only |
| Who is in it | a fictional church | a real one |
| Shell | `components/AppShell.tsx` | `components/LiveAppShell.tsx` |

**A change to one side is usually a bug on the other.** Somebody learns the app
on the sample side and then signs in; if a room is in one header and not the
other, they were taught a layout that does not exist. When you add a room, add
it to `SECTIONS` in `LiveAppShell`, to `railGroupsFor` in `RoomRails`, and to
the sample header — `tests/live-header-fits.mjs` fails if the rail and the
header disagree, and it exists because three rooms were reachable only on a
screen wider than 1280px for weeks.

---

## 2. The rules that outrank whatever you were asked for

Break one of these and the app becomes a different product. If a request seems
to need it, say so and stop.

**An Explorer never sees their own journey stage.** A stage is a note the church
keeps to organise its work, not a label to show a human being about themselves.
`getMyPairing()` does not select the column and its return type has no field for
one, so reaching for it fails to compile.

**Leaders get counts; Guides get the relationship.** No screen shows anybody a
conversation they are not in. Not a Director, not an Executive Director.

**Every room where one person can hurt another has three things**, on the same
screen as the harm:

1. a way for the person harmed to report it, findable without hunting and never
   next to Send;
2. somebody whose job it is to look, who is notified by name;
3. a record that outlives the person it describes.

This is the test to apply to any new social surface *before* it ships. The Guild
board shipped without all three — no report route, no leadership visibility, and
only its author could delete a post — in a room that includes Explorers, some of
whom are minors. See `supabase/migrations/20260831060000_a_way_out_of_the_guild_room.sql`
for what it took to fix, and `tests/a-way-out-of-the-guild-room.mjs` for the
shape of the check.

**The narrow door, not the open one.** Fixing that room did *not* mean handing
leadership the whole board. A group talking honestly is what the room is for.
Leadership sees a post when, and only when, somebody reports it. Prefer the
smallest new visibility that makes the harm actionable.

**A safeguarding record cannot be deletable.** `reports` has no delete policy at
all, deliberately. When a report points at something a person can remove — a
post, a message, a file — copy the content into the report at the moment it is
reported. Otherwise the move is: post, get reported, delete, and the Director
opens a report about nothing.

---

## 3. Authorisation lives in the database

The browser holds an anon key and nothing else. Every rule that matters is a
policy or a `security definer` function.

- **`permission denied for table X` is a GRANT failure, not RLS.** RLS returns
  zero rows; it does not raise. That error means the request arrived
  unauthenticated — the tables and functions here are granted to `authenticated`
  and never to `anon`. Chasing it as a policy bug wastes a day.
- **The pattern for anything privileged**: the real function in the `private`
  schema, `security definer`, doing its own authorisation check and raising
  `42501` when it fails; a thin `public` wrapper; `revoke` from `public, anon`;
  `grant execute` to `authenticated`. The table itself gets RLS enabled *and*
  every grant revoked, so the function is the only way in.
- **The column list is the access control.** `select('*')` in `lib/live/data.ts`
  is how a birthday ends up in an Explorer's browser with nothing between it and
  a screen but somebody remembering not to render it. Name the columns, and let
  the return type have no field for what you did not ask for.
- **Verify a claim about permissions against the live database**, inside
  `begin; … rollback;`, by setting `request.jwt.claims` and `role` to each
  identity in turn and recording the outcome. Collect the results into a temp
  table and insert them *after* switching back, or the insert itself is denied.
  Reasoning about a policy is not the same as running it.

---

## 4. Migrations

**Name new files with a timestamp, never `00NN_`.** The early files are
`0001_`…`0049_`; everything since is `YYYYMMDDHHMMSS_`. The test sorts filenames
lexicographically, and `0050_` sorts *before* `20260829…`, so a `00NN` file
added today would run before tables it depends on and fail on a fresh database
while passing on yours.

**The version recorded in the database never matches the filename.** Migrations
applied through the Supabase tooling are stamped with the time they were
applied. Do not read the ledger and the directory as if they line up; check for
the objects instead.

**Never edit a migration that has been applied.** Editing the file changes
nothing in the database and quietly makes a fresh environment differ from
production. Add a corrective migration that re-creates the object. (Editing one
that failed on a syntax error and never ran is fine — nothing has it yet.)

**Dry-run every migration before applying it**: run the body inside
`begin; … rollback;` against the real database. It costs one call and catches
the ambiguous column reference that a fresh pair of eyes will not.

---

## 5. `npm run verify` is the gate

It runs typecheck, build, and every check in `tests/`, and CI runs the whole
thing on Ubuntu, macOS **and** Windows. A green local run on Linux is not a
green build.

- **A rule that cannot fail is not a rule.** Before trusting a new check, break
  the thing it guards and watch it go red. Several checks here printed `OK` for
  years while covering nothing: one matched its own comment, one stopped its
  regex at the `>` inside `=>` and so never saw a single button, one walked
  files with a Unix `find` that returned nothing at all on Windows.
- **Match the thing, not a list of the things that existed when you wrote it.**
  The destructive-button rule held an allowlist of eight exact labels, so the
  ninth was never checked; its label extractor allowed only letters and spaces,
  so every confirm button that names a person — the ones that actually carry out
  the removal — was invisible to it. Word boundaries, not equality.
- **Assert behaviour, not shape.** A check that passes because it found a string
  somewhere is worse than none: it reports green and covers nothing.
- **Portability**: no `find`, no `grep`, no bare `npx` in a test. Walk the tree
  in Node, normalise paths to forward slashes, resolve binaries through
  `createRequire`.

---

## 6. It is used on a phone, and mostly not a new one

The desktop is the exception here, not the default. These are all real bugs that
shipped:

- **`dvh`, not `vh`.** They are identical on a desktop. On a phone `vh` is the
  layout viewport with the address bar hidden, so `max-h-[90vh]` is taller than
  the screen. Keep a `vh` line underneath for old browsers.
- **`env(safe-area-inset-bottom)`** is 0 on a desktop and about 34px on a phone.
  Anything pinned to the bottom needs it.
- **No characters from a symbol block.** Emoji have a guaranteed fallback font
  on every platform; Miscellaneous Technical and Geometric Shapes do not, and
  render as a blank box on Android while looking perfect on a Mac. Controls are
  drawn in `components/Glyph.tsx` as inline SVG. `tests/glyphs-render-everywhere.mjs`
  refuses the rest.
- **The rails are `xl:block`.** Below 1280px the scrolling header row is the
  entire navigation. That includes every phone and an iPad in portrait.
- **Every `<button>` is 56px tall** from `globals.css`. Padding cannot make one
  smaller; only `.tap-sm` (44px) can, and the `danger` variant is the only thing
  that uses it — which is the point: the most damaging control on a screen is
  never the most inviting one.
- **Nothing may scroll sideways.** Wide content scrolls inside its own box.

---

## 7. Two agents, one branch

`main` is production. Vercel builds Production only from `main`, so a feature
branch can never produce anything but a preview.

- **Rebase, never force.** The other agent's commits may be sitting on top of
  yours; `git pull --ff-only` then continue. If a shared file has moved under
  you, read what changed before re-applying your edit.
- **If the other agent's guardrail fires on your change, it is probably right.**
  The header-drift check caught a missing room in the very next commit after it
  was written. Fix the change, not the test — and if the test is genuinely wrong
  now, rewrite it to describe the new truth rather than deleting it.
- **Say what you did not verify.** This sandbox cannot reach the deployed site
  and has no browser session for the live app, so a screen that needs a signed-in
  database session has not been seen rendered. Push is not deploy: report
  "pushed, build not observed" rather than "live", every time.
- **Commit messages are the record.** Name the problem before the mechanism, and
  include what was tried and rejected. The next agent has no memory of this
  conversation; the message is all it gets.

---

## 8. Where things are

| Path | What lives there |
|---|---|
| `app/` | Routes, one folder per room. |
| `components/` | Everything visual. |
| `components/live/` | The signed-in screens: door, admin, guide, explorer, shared. |
| `lib/live/data.ts` | **Every** live database call. Nothing else talks to Supabase. |
| `lib/live/session.tsx` | Who is signed in, and the rules for deciding they are not. |
| `lib/live/errors.ts` | `humanError()`. One place turns a database error into a sentence. |
| `lib/demo/` | The sample church: store and seed. |
| `lib/types.ts` | Every shape in the app. |
| `lib/brand.ts` | Name and colours. |
| `supabase/migrations/` | The database, in order. |
| `supabase/functions/` | Edge functions, currently the invitation mailer. |
| `tests/`, `tests/e2e/` | The guardrails. `scripts/verify.mjs` lists them all. |
| `.github/workflows/` | verify (3 OSes), keep-awake, backup, two WebKit probes. |

---

## 9. Signing out is not tabbing away

One class of bug is worth naming because it has come back twice. Supabase
rotates refresh tokens: if a second browser context spends the token first, the
first context's refresh returns 400. Clearing storage on that 400 destroys a
perfectly good session, and the person is signed out for switching tabs.

The rule is in `lib/live/session-verdict.ts` and it is deliberately not a regex
over the error message. Re-read storage before concluding anything, and only
then decide between *signed out*, *hold*, and *report*.
