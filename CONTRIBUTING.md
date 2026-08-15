# Contributing

Thank you for being here. This app exists to be forked, changed and made into
somebody else's — so if you are only using it for your own church, you owe
nothing and can stop reading. If you want to send something back, this is how.

---

## Get it running

```bash
git clone https://github.com/Klydo131/Open-Hope-Beacon
cd Open-Hope-Beacon
npm install
npm run dev            # http://localhost:3000
```

That is the whole setup. No `.env` to fill in, no database, no account, no seed
script. Sample people and sample activity are already there.

Requires **Node 22 or newer** and nothing else. Some tests import TypeScript
directly and rely on Node's native type stripping, so there is no build step
between the code that ships and the code that is checked.

---

## Before you open a pull request

```bash
npm test          # every check that does not need a browser (~1 min)
npm run test:all  # the above, plus the real-browser walks (~4 min)
```

`npm test` has to be green. Run `npm run test:all` too if you touched anything
somebody clicks — it drives a real browser through the guided walks and catches
the class of bug where the code is right and the button is under a banner.

If a check fails and you believe the check is wrong, say so in the pull request.
Several of these tests exist because a previous version of them was wrong; that
is a fair argument to make, and a better one than quietly deleting the file.

---

## What a good pull request looks like

**Say what breaks without it.** Not "improves the Director page" — "a Director with
more than 40 members cannot reach the invite button on a phone". One concrete
sentence about what goes wrong is worth a page of description.

**Keep it to one thing.** A fix and a refactor in one diff is two reviews
pretending to be one.

**Add a test for a fix**, and make it fail first. Break the code it covers and
watch it go red. A test that has never failed is a comment with a run time.

**Match the surrounding style.** Do not reformat files you are not changing.

---

## House style

These are not preferences. Each one exists because its absence cost somebody a
day.

### Comments explain *why*, not *what*

The code already says what it does. A comment earns its place by recording the
bug that made it necessary, or the obvious alternative and why it failed.

You will find a lot of these, some of them long. They are the most valuable
thing in the repository — this project is meant to be inherited, and the bar is
not "does it work" but "will the next person understand why it is like that".

### Guardrails are tests, not agreements

If a rule matters, there is a file in `tests/` that fails when it is broken.
Four of them hold the promises this project makes about itself:

| File | Refuses |
|---|---|
| `tests/no-backend.js` | A database dependency, a route that stores data, an analytics SDK, a call to an external server, or somebody else's deployment pipeline reappearing. |
| `tests/no-secrets.js` | A credential of recognisable shape in any tracked file, a real `.env`, sample data at a domain that could reach a real inbox. |
| `tests/security-invariants.mjs` | A weakened Content-Security-Policy, a URL guard that stops blocking `javascript:`, CI a pull request could hijack. |
| `tests/brand-consistency.mjs` | Icons drifting from the one drawing of the logo, or the app's name hardcoded somewhere a rename would miss. |

If your change makes one of these fail *correctly* — you are adding a backend on
purpose, say — update the test to describe the new truth. Do not delete it.

### Assert behaviour, not shape

A test that passes because it found a string somewhere on the page is worse than
no test: it reports green and covers nothing. One suite here once printed
`ALL OK` for a tutorial that was completely stuck.

### No new dependencies without a strong reason

This app ships React and Next and almost nothing else, on purpose. It has to
stay installable on a cheap phone and auditable by one person in an afternoon.
A pull request adding a dependency should say what it replaces and why the
fifteen lines it saves are worth it.

### Two product rules that outrank convenience

**An Explorer never sees their own journey stage.** A stage is a note the church
keeps to organise its work, not a label to show a human being about themselves.
`tests/e2e/seeker-no-stage.js` enforces it.

**Leaders get counts; Guides get the relationship.** There is no screen
anywhere that shows a pastor somebody's conversation, and adding one would
change what this app is. If you think it needs one, open an issue first.

---

## Where things are

| Path | What lives there |
|---|---|
| `app/` | Routes. One folder per screen, Next.js App Router. |
| `components/` | Everything visual. No data fetching. |
| `lib/demo/store.tsx` | The store: every piece of state, every action. |
| `lib/demo/seed.ts` | The sample church. |
| `lib/backend/` | The seam where a real backend plugs in. |
| `lib/brand.ts` | The app's name and colours. Change here, nowhere else. |
| `lib/quest.ts` | The guided walks, one per role. |
| `lib/types.ts` | Every shape in the app, in one file. |
| `tests/`, `tests/e2e/` | Guardrails, unit checks, real-browser walks. |

[ARCHITECTURE.md](./ARCHITECTURE.md) explains how the pieces fit.
[docs/BACKENDS.md](./docs/BACKENDS.md) covers connecting a real one.

---

## Sample data

The sample church is fiction and must stay fiction. Names use reserved domains
(`.example`, `.test`) that can never resolve to a real inbox, and a test enforces
it.

**Never commit real people's details** — not briefly, not in a branch, not "to
test something". A public repository is indexed within minutes and git
remembers.

---

## Reporting a bug

Open an issue with what you expected, what happened, and the build id from
**Settings › App version**. That id usually tells us more than a description
does.

## Reporting a vulnerability

**Not** in a public issue. Use GitHub's private
[Security Advisories](https://github.com/Klydo131/Open-Hope-Beacon/security/advisories/new).
See [docs/SECURITY.md](./docs/SECURITY.md) for what to include and what to
expect.

---

## Licence

MIT. By contributing you agree your work ships under it.
