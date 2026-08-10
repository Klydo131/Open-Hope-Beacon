# How Open Hope Beacon is built

Written for a developer who has just cloned this and wants to know where things
are before changing anything. No prior knowledge of the project is assumed.

---

## The one-sentence version

It is a Next.js app with **no backend**: every screen reads and writes a single
store that lives in the browser, so the whole thing runs offline, installs like a
phone app, and needs no database, no account service and no configuration.

That is not a limitation to work around. It is the design, and it is what lets a
church try the entire application before deciding anything — and what lets you
run the test suite without standing anything up.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

That is the whole setup. There is no `.env` to fill in, no database to migrate,
no seed script to run. Sample people and sample activity are already there.

```bash
npm test             # every check that does not need a browser
npm run test:all     # the above, plus the end-to-end suites in a real browser
npm run build        # production build
```

Requires **Node 22 or newer**. Some tests import TypeScript directly and rely on
Node's native type stripping, so there is no build step between the code that
ships and the code that is checked.

---

## Where things are

| Path | What lives there |
|---|---|
| `app/` | Routes. One folder per screen, Next.js App Router. |
| `components/` | Everything visual. No data fetching beyond the store. |
| `lib/demo/store.tsx` | **The store.** Every piece of state, and every action. |
| `lib/demo/seed.ts` | The sample church: people, pairings, lessons, history. |
| `lib/backend/` | The seam where you plug in a real backend. |
| `lib/quest.ts` | The guided tutorial: one walk per role. |
| `lib/types.ts` | Every shape in the app, in one file. |
| `tests/` | Guardrails and unit checks. |
| `tests/e2e/` | Real-browser suites, phone-sized by default. |

---

## The store is the whole data layer

`lib/demo/store.tsx` is a React context. It holds the entire application state
and exposes every action as a function:

```tsx
const { db, currentUser, sendMessage, advanceStage, createPairing } = useDemo();
```

Two things follow from that, and they are the most useful facts in this document.

**Nothing else touches data.** No component fetches. No screen knows where
anything is stored. If you want to know what the app can do, read the `Ctx`
interface at the top of that file — it is the complete list.

**The `Ctx` interface is therefore the backend contract.** Anything that can
satisfy those functions can be the backend. That is what makes this app
platform-agnostic: not an abstraction layer added on top, but the fact that there
is only ever one place data comes from.

State persists to `localStorage` and is normalised on load, so a save written by
an older version still opens in a newer one.

---

## Plugging in a real backend

See **[docs/BACKENDS.md](docs/BACKENDS.md)** for the full walkthrough. In short,
there are two seams and you can use either or both:

**1. The feedback sink** (`lib/backend/feedback.ts`) — smallest possible example
of the pattern, and a good first thing to try. One function, one call to swap it:

```ts
setFeedbackSink({
  describe: 'sent to our church office',
  async send(message) {
    const res = await fetch('/api/feedback', { method: 'POST', body: JSON.stringify(message) });
    return { ok: res.ok };
  },
});
```

**2. The store itself** — for a real multi-device deployment. Implement the `Ctx`
interface against your database, and provide it instead of `DemoProvider`. Every
screen keeps working unchanged, because no screen knows the difference.

**Whatever you connect, its secrets belong on your server.** Anything this app
can read, every visitor can read. There is a test that fails the build if a
credential appears in the repository.

---

## Roles, and the rule that matters

Four roles: **Seeker**, **Missionary**, **Admin**, **Executive Admin**. Each sees
a different application from the same data.

One rule is enforced by a test rather than by convention, and it should survive
any change you make: **a Seeker never sees their own journey stage.** A stage is
a note the church keeps in order to organise its work. It is not a label to show
a human being about themselves. `tests/e2e/seeker-no-stage.js` opens the seeker's
screen and asserts that no stage name appears anywhere on it.

---

## Offline and updates

The app installs from the browser and works without a connection. Every route is
warmed when it installs, so losing signal does not restrict you to the screens
you happened to have opened.

When you deploy a new version, an open app notices within about thirty seconds
and offers a one-tap restart. Nobody is ever asked to uninstall and reinstall.
`app/version.json/route.ts` reports the build; `components/VersionWatch.tsx`
decides when to ask.

---

## House style

These are not preferences. Each exists because its absence cost somebody a day.

**Comments explain *why*, not *what*.** The code already says what it does. A
comment earns its place by recording the bug that made it necessary, or the
obvious alternative and why it failed. You will find a lot of these; they are the
most valuable thing in the repository.

**Guardrails are tests, not agreements.** If a rule matters, there is a file in
`tests/` that fails when it is broken.

**Make a new test fail first.** Break the code it covers and watch it go red. A
test that has never failed is a comment with a run time.

**Assert behaviour, not shape.** A test that passes because it found a string
somewhere on the page is worse than no test — it reports green and covers
nothing.

**No new dependencies without a strong reason.** This app ships React and Next
and almost nothing else, on purpose: it has to stay installable on a cheap phone
and auditable by one person.
