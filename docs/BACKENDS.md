# Connecting a real backend

This app has no backend. That is the design, not a gap: it means a church can
run the whole thing, on a phone, offline, before deciding anything.

At some point a church stops evaluating and starts using it. Then two people
need to see the same conversation on two different devices, and everything below
applies.

**Nothing here is required to run the demo.** If you are just trying the app,
close this file.

---

## Before you write any code

Three sentences that will save you a bad week.

1. **Anything the browser can read, every visitor can read.** There is no such
   thing as a secret in this repository. Not in `.env`, not in a component, not
   "just for now".
2. **The screens decide what to *show*. Your database decides what somebody is
   *allowed to have*.** Anybody can send a request without using your screens.
3. **Put the rule with the data.** A rule in the database applies to every route
   into it, including a screen somebody adds next year without reading this.

[SECURITY.md](./SECURITY.md) is the longer version. Read it before you connect
anything holding real names.

---

## Two seams, and you can use either

| Seam | Effort | What it buys you |
|---|---|---|
| **The feedback sink** (`lib/backend/feedback.ts`) | 15 minutes | Messages from your congregation reach you instead of staying on their device. |
| **The store** (`lib/demo/store.tsx`) | A real project | Accounts, multiple devices, actual church use. |

Start with the first even if you want the second. It is the same pattern at one
twentieth the size, and it works end to end, so you find out how the app fits
together before anything important depends on your answer.

---

## Seam 1: where feedback goes

### What is there now

`lib/backend/feedback.ts` defines a **sink** — one function that takes a message
and reports whether it arrived. The default keeps messages on the device and
says so honestly in the UI.

```ts
export interface FeedbackSink {
  send(message: FeedbackMessage): Promise<FeedbackResult>;
  readonly describe: string;   // shown to the person: "where does this go?"
}
```

### Replacing it

One call, anywhere that runs once at startup:

```ts
// app/providers.tsx
'use client';
import { useEffect } from 'react';
import { setFeedbackSink } from '@/lib/backend/feedback';

setFeedbackSink({
  describe: 'sent to the church office',
  async send(message) {
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      return { ok: res.ok, note: res.ok ? 'Sent to the church office.' : undefined };
    } catch {
      return { ok: false };          // offline, or the server is down
    }
  },
});
```

Note the URL: `/api/feedback` on **your own** origin, not a third party's. Your
server is where the key lives. Add that route yourself — this repository ships
no route that stores anything, and `tests/no-backend.js` will tell you so on the
next run. That is the test doing its job; when you fork to build a real
deployment, edit its allow-list rather than deleting the file.

### The three rules for any sink

Each one is in the source as well, because each one has cost somebody something.

1. **Never throw.** A message a person took the trouble to write must not vanish
   because a train went into a tunnel. Return `{ ok: false }` and the app keeps
   the draft so they can try again.
2. **Never put a secret in it.** This file ships to the browser. An API key in a
   sink is an API key published to every visitor.
3. **Rate limit on your server.** Anything enforced in the browser is skipped by
   opening the network tab. If your endpoint sends email or writes rows, limit
   it server-side, and key the limit on something the caller cannot change for
   free.

### Checking it

Send a message from the app. Then:

- Turn the network off and send another. The app should say "Not sent yet" and
  keep what was typed, not lose it.
- Send the same draft twice. Your server should see the same `id` and file it
  once. That id is stable across retries on purpose.

---

## Seam 2: the store

### The one fact that matters

Every screen in this app reads and writes through a single React context in
`lib/demo/store.tsx`. **No component fetches anything.** The `Ctx` interface at
the top of that file is the complete list of what the app can do — a little over
fifty members, all of them small.

That interface is the backend contract. Satisfy it and every screen works
unchanged, because no screen knows the difference.

```ts
const { db, currentUser, sendMessage, advanceStage, createPairing } = useDemo();
```

### The shape of the work

```tsx
// app/layout.tsx — replace <DemoProvider> with your own
import { DemoContext, type Ctx } from '@/lib/demo/store';

function RealProvider({ children }: { children: React.ReactNode }) {
  const value: Ctx = useYourBackend();   // TypeScript lists what is missing
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
```

`Ctx` and `DemoContext` are both exported for exactly this. Type your object as
`Ctx` and the compiler becomes the checklist — it names every function you have
not written yet, which is a far better plan than discovering them one screen at
a time.

### A sensible order

You do not have to build all of it before anything runs.

1. **Accounts.** `signInAs`, `signOut`, `currentUser`. Nothing else works until
   somebody is signed in.
2. **Reading.** Populate `db` from your database. Every screen renders
   read-only, and you can look at all of them.
3. **The core loop.** `sendMessage`, `advanceStage`, `createPairing`,
   `approveUser`. That is a usable app.
4. **The rest**, as each screen needs it.

Keep `DemoProvider` around while you do this. Being able to switch back to the
demo store is how you tell "my backend is wrong" apart from "the app is wrong",
and you will want that distinction more than once.

### `db` is one snapshot, and that is deliberate

The app expects `db` to hold the current state of everything it can see, and
re-renders when it changes. For a church — tens to low hundreds of people — this
is fine and keeps the whole app simple.

If you are wiring something much larger, this is the assumption to revisit
first, and the change is localised: `db` becomes several queries behind the same
interface.

### The rules your data layer now owns

Screens enforced these while there was no server. From your first real user,
they are yours, in your data rules:

| Rule | What breaks without it |
|---|---|
| A missionary reads only their own pairings | Every missionary reads every conversation in the church. |
| Private notes are readable by their author alone | The thing a missionary was promised is private, is not. |
| A seeker never receives their own stage | A pastoral note becomes a grade shown to the person. |
| Only an admin invites and pairs | Anybody adds anybody to the church's records. |
| Nobody changes their own role | The first curious person becomes an admin. |

That last one deserves a sentence of its own. If your backend has an "update my
profile" call, it must **not** accept a role — pin it to the role already
stored. A member who can promote themselves is the entire security model gone,
and it is the single most common way an app like this is broken.

While you are there: **delete `components/RoleSwitcher.tsx`** and `setMyRole`
from the store. That is the demo's role switcher, it is safe only because there
is no server, and it must not survive the day one appears.

---

## Deploying

It is a standard Next.js app with no runtime configuration. Vercel, Netlify,
Cloudflare Pages, a Node server, a container — all fine.

Two things worth knowing:

**Content-Security-Policy.** `next.config.mjs` allows this origin and nothing
else. When you add a backend on another origin, add it to `connect-src` — and
only there. Widening `default-src` instead is the usual shortcut, and it gives
away every other directive at the same time.

**Updates.** `app/version.json/route.ts` reports the build id and
`components/VersionWatch.tsx` polls it, so an open app notices a new deployment
within about thirty seconds and offers a one-tap restart. This works on any host
that serves the app; there is nothing platform-specific in it, and nobody is
ever asked to uninstall and reinstall. See [UPDATES.md](./UPDATES.md).

---

## When you are done

Run the suite:

```bash
npm test
```

`tests/no-backend.js` will now fail, because you have added a backend. **That is
the correct result** — it is not a check to delete, it is a check to update. Edit
its allow-lists to describe what your fork is allowed to have, so it goes on
catching the thing it exists for: a dependency, a route or an analytics SDK that
nobody meant to add.

Everything else in `npm test` should stay green. If `tests/no-secrets.js` goes
red, stop and read it before doing anything else — that one is telling you a
credential is about to be published.
