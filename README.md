# Open Hope Beacon

**A disciple-making journey app for local churches. Free, open source, and yours
to change.**

A church meets someone who wants to know more. What happens next usually depends
on a card in a folder and somebody's memory. Open Hope Beacon gives the church
one place for that, and gives each person involved exactly the part of it they
need.

It runs entirely in your browser. **No sign-up, no database, no configuration.**
Clone it, start it, and you are looking at a working church with sample people in
it.

---

## Try it in two minutes

```bash
git clone https://github.com/Klydo131/Open-Hope-Beacon
cd Open-Hope-Beacon
npm install
npm run dev
```

Open http://localhost:3000 and pick who you are. There is a guided walk for each
role that shows you your own job in about ten minutes.

Needs [Node 22 or newer](https://nodejs.org). Nothing else.

---

## What it does

Four kinds of people, each seeing a different app built from the same data.

| | What they see |
|---|---|
| **Seeker** | Messages from the person walking with them, their lessons, how far through a course they are, and a way to ask for prayer. |
| **Missionary** | Their own people and nobody else's. Conversations, lessons to share, meetings to arrange, private notes. |
| **Admin** | Who gets in, who walks with whom, and what is on the library shelf. |
| **Executive Admin** | The church in numbers, and how those numbers are changing. Never anybody's conversations. |

Underneath is a six-stage journey — **Create, Connect, Care, Call, Cultivate,
Commission** — which ends by turning around: the last stage is the point where
somebody being walked with starts walking with somebody else.

**A seeker never sees their own stage.** A stage is a note the church keeps to
organise its work, not a label to show a person about themselves. A test enforces
this, and it should survive anything you build on top.

---

## Why it might suit your church

- **Nothing to buy and nothing to sign up for.** It is MIT licensed. Fork it,
  rename it, run it on whatever you already use.
- **It works without signal.** Installs on a phone from the browser, and every
  screen keeps working offline. Church halls and rural areas were the assumption,
  not an afterthought.
- **It teaches itself.** Each role has a guided walk, written for somebody who
  has never used it and does not enjoy new software.
- **It is small enough to read.** React, Next.js and almost nothing else. One
  person can audit the whole thing.
- **It is honest about privacy.** Leaders get numbers; missionaries get the
  relationship. Private notes are private to one person, and there is no screen
  anywhere that shows a pastor somebody's conversation.

---

## Making it yours

**Change the words.** Roles, stages and sample data are ordinary files —
`lib/types.ts`, `lib/demo/seed.ts`. Nothing is hard-coded into the framework.

**Connect a real backend when you are ready.** The app talks to exactly one
thing: a store in `lib/demo/store.tsx`. Anything that satisfies the same
interface can replace it — Supabase, Firebase, your own API, a spreadsheet. See
**[docs/BACKENDS.md](docs/BACKENDS.md)** for a worked example, starting with the
smallest one: where feedback goes.

**Deploy it anywhere.** It is a standard Next.js app. Vercel, Netlify, Cloudflare
or your own server all work. There is nothing platform-specific in it.

---

## Before you put real people in it

Read **[docs/SECURITY.md](docs/SECURITY.md)**. The short version: as shipped
there is nothing to breach, because there is no backend and no data leaves the
browser. The day you connect one, the security of what you connected is yours,
and the two things people get wrong are putting authorisation in the screens
instead of the database, and putting a key somewhere the browser can read it.

---

## Where to read next

| | |
|---|---|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | How it is built, and where everything lives. Start here if you are about to change something. |
| **[docs/BACKENDS.md](docs/BACKENDS.md)** | Connecting a real backend, in two sizes: fifteen minutes, or a real project. |
| **[docs/ONBOARDING.md](docs/ONBOARDING.md)** | How a church actually uses it: who does what, in what order. |
| **[docs/SECURITY.md](docs/SECURITY.md)** | Read before you put real people in it. |
| **[docs/UPDATES.md](docs/UPDATES.md)** | How an installed copy updates itself. |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Setup, house style, and what a good pull request looks like. |
| **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** | Short, and the standard is ordinary decency. |

---

## Contributing

Please do. See **[CONTRIBUTING.md](CONTRIBUTING.md)**.

The bar is not "does it work" but "will the next person understand why it is like
that". Comments here explain *why* rather than *what*, and that is deliberate:
this project is meant to be inherited.

```bash
npm test          # every check that does not need a browser
npm run test:all  # the above, plus real-browser suites
```

---

## Where this came from

Open Hope Beacon is the open-source release of Hope Beacon, an app built for a
local church. Their request was that other churches should be able to make their
own, on whatever platform suits them. Everything specific to that church's
deployment — its database, its keys, its hosting — was removed, and a test keeps
it that way.

MIT licensed. See [LICENSE](LICENSE).
