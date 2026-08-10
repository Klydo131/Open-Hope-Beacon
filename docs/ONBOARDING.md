# Onboarding a church

How a church actually uses this app: who does what, in what order, and which
steps deliberately do **not** happen in the app at all.

Read the first section and you will know the model. The rest is detail.

> **What you are running.** As shipped there is no backend. Every account,
> message and pairing lives in your own browser, and nothing leaves your device.
> The flow below is the real one and you can click all of it — but where it says
> a rule is enforced by the database, that is a rule *your* deployment has to
> enforce once you connect one. See [BACKENDS.md](./BACKENDS.md) and
> [SECURITY.md](./SECURITY.md).

---

## The short version

```
  OFF THE APP                          IN THE APP
  ───────────                          ──────────

  Church decides to use the app
            │
            ▼
  Church leadership approves a
  person to serve as a missionary ───▶ Admin invites them as a missionary
  (this never touches the app)                  │
                                                ▼
                                        Missionary signs up from the link
                                        and lands on CREATE
                                                │
  Missionary knows someone who                  ▼
  might welcome a companion  ────────▶ Missionary recommends them:
                                        name + email → the admin
                                                │
                                                ▼
                                        Admin invites them
                                                │
                                                ▼
                                        Seeker signs up from the link
                                        and is paired automatically
                                        with the missionary who
                                        recommended them, at CONNECT
                                                │
                                                ▼
                                        Missionary walks with them:
                                        CARE → CALL → CULTIVATE
                                             → COMMISSION
```

**The journey begins at Create for a missionary and at Connect for a seeker.** A
seeker is never at Create, because by the time they have an account a missionary
already brought them.

---

## Step by step

### 1. Create the church, and its admin

Whoever runs the deployment creates the church record and invites its first
**Admin**. The admin is the only account that has to exist before anything else
can happen.

The admin is the church's coordinator: they approve people, invite people, pair
people, and keep the resource library. In a small church this is the pastor.

### 2. Church leadership approves missionaries — off the app

The board, elders, or whoever decides in your church **has no account here and
does not need one.** They meet, they decide who is fit to serve, and they tell
the admin. None of that is recorded in the app, because none of it happens
there.

This matters for two reasons:

- Nobody waits for a "board approval" screen that does not exist.
- If a board member wants numbers, the admin shows them. There is no login to
  hand out, no password to manage, and no seeker's identity exposed to a group
  of people who have no reason to see it.

If your church works differently, this is a decision and not a law — but think
carefully before giving a login to anybody whose job is to read totals.

### 3. The admin invites the missionaries

Admin → **Invite** → name, email, role **Digital Missionary**.

In a real deployment the person receives an email with a one-time link. Make it
expire, and make it work only for the address it was sent to, so forwarding it
achieves nothing.

They open the link, set a password, and they are in. **A missionary starts at
Create**: an account, and no seekers yet.

### 4. A missionary recommends a seeker

This is the step the whole model turns on.

A missionary knows someone — a neighbour, a colleague, a friend who asked a
question after a service. That person has **no account and has never heard of
the app**.

Missionary → **Recommend someone to the admin** → their name, their email, and
optionally why.

The missionary **cannot invite them**. They recommend; the admin decides. In a
real deployment, enforce that line in the database and in whatever function
sends invitations — not only in the screens. A missionary who can invite is a
missionary who can add anybody to the church's records.

### 5. The admin invites the recommended seeker

The recommendation reaches the admin with the missionary's name against it. The
admin has two answers:

- **Invite** — an invitation goes out, carrying the recommending missionary with
  it.
- **Not now** — the recommendation is closed and the missionary is told. Nothing
  is deleted. A missionary who hears nothing back assumes the app ate it, and
  stops recommending people.

### 6. The seeker joins, already paired

The seeker opens their link, sets a password, and completes a short profile.

At that moment — in the same transaction that creates their account — **the
pairing is created**: with the missionary who recommended them, at stage
**Connect**. Nobody has to remember to do it, and there is no window in which a
new seeker exists with nobody attached.

### 7. The journey

The missionary walks with them: **Care → Call → Cultivate → Commission**. Only
the missionary and the admin ever see which stage someone is on.

---

## Who sees what

| | Sees |
|---|---|
| **Admin** | Everything in their own church. Approves, invites, pairs, monitors. |
| **Executive Admin** | The same, across every church they oversee. |
| **Digital Missionary** | **Only the seekers paired with them.** Their conversations, their journeys, their own private notes. Nothing about another missionary's seekers. |
| **Digital Seeker** | Their own page, their own missionary, and what has been shared with them. |
| **Church leadership** | No account. Aggregate numbers from the admin, when they ask. |

Two rules are worth stating plainly, because churches ask about both.

**A seeker never sees a journey stage — including their own.** A stage is a note
the church keeps about a person's progress. Shown to that person it reads as a
grade. It appears on the missionary's and the admin's screens, and nowhere a
seeker can reach. `tests/e2e/seeker-no-stage.js` enforces this; keep it passing.

**A missionary's private notes about a seeker are private from everyone**,
including the admin and including the seeker. They exist so a missionary can
remember what was actually said without it becoming a church record.

**As shipped, both rules are enforced by the screens alone**, which is fine for
evaluating the flow and wrong to rely on for anything real — everything here is
sample data about invented people. When you connect a backend, enforce them in
your data rules, where a request that never touches your screens still meets
them.

---

## Before the session: the demo teaches each person their own job

The people deciding whether a church adopts this are often in their forties,
capable, and not especially interested in software. They can learn it. What they
cannot learn from is a tutorial about somebody else's job.

So there is **one guided walk per role**. The app opens by asking *"Who are you
in your church?"* and each answer leads somewhere different.

| Who | Tasks | What it teaches |
|---|---|---|
| **Executive Admin** | 3 | The church at a glance, the journey chart, and the gate everyone passes through to join. Counts, never conversations. |
| **Admin** | 5 | Who is waiting, letting someone in with a role, acting on a missionary's recommendation, pairing a missionary with a seeker, and stocking the library. |
| **Missionary** | 5 | Open a seeker, message them, advance their journey, share a resource, make your profile yours. |
| **Seeker** | 3 | Say hello, open a lesson, ask for prayer. No stage name appears anywhere. |

Each step names the screen it happens on, so that when the arrow is gone the
person still knows where the thing lives. That is the difference between being
led through a demo and being able to use the app.

**Run the walks before onboarding day.** Ten minutes each, on sample data, on a
phone. Nothing anyone presses reaches a real person. Whoever is facilitating
should have done all four, so they can answer the question that always comes:
*"can they see my messages?"*

The walks are in the app under **Settings › Tutorial**, so somebody who wants to
run theirs again a week later needs nobody's help.

The walks live in `lib/quest.ts`. If you change a screen, change the walk that
points at it — `tests/e2e/quest-roles.js` completes every walk in a real browser
and fails if an arrow points at something that is not there.

---

## What to prepare before onboarding day

A church needs surprisingly little:

1. **One admin**, with an email address they actually read.
2. **The leadership's decision** about who will serve as missionaries — made
   before the session, since it happens off the app anyway.
3. **An email address for each missionary.** This is the only thing that
   commonly holds a session up. Shared family addresses and addresses nobody
   checks both cause trouble later, when an invitation goes unread.

Seekers need nothing in advance. They arrive later, through a missionary.

**Nothing is emailed in this build.** Every message the app would have sent is
captured in the Mail screen instead, worded exactly as it would arrive, so you
can read it and follow the links with no mail server anywhere.

## A realistic first session

| | |
|---|---|
| Create the church, invite the admin | 5 min |
| Admin signs in, sets the church name, looks around | 10 min |
| Invite the missionaries (2 min each) | 20 min for 10 |
| Walk one missionary through recommending someone | 10 min |
| Questions | 15 min |

The missionaries do not all need to be in the room. Their invitations wait.

---

## The direction this is heading

**A seeker becoming a missionary** is the point of the whole six-stage shape:
Commission is where somebody being walked with starts walking with somebody
else.

The promotion itself is **not built**, and it is worth saying why rather than
implying it arrives next week. It needs decisions nobody has made:

- What happens to the pairing they were in? Does it close, or stay as a
  relationship with a different shape?
- Who approves the promotion — the admin alone, or the church leadership off the
  app, like every other missionary?
- What carries over? Their journey history is a record of them as a seeker, and
  their new seekers should not be able to read it.

Until those are answered, promotion is done the honest way: leadership approves
them like anyone else, and the admin changes their role.

If your church has answered those questions, this is a good thing to contribute.

---

## Troubleshooting

**"I never got the invitation."** Check spam first. If your deployment expires
invitations, an old one needs replacing — the admin sends a new one. A link that
only works for the address it was sent to will fail if it was forwarded.

**"I signed up but I have no seekers."** That is correct for a new missionary.
Recommend someone, or wait for the admin to pair you.

**"A seeker joined but is not paired with me."** This happens when the admin
invited them directly rather than from your recommendation. Ask the admin to
pair you; it takes ten seconds.

**"Can the board have a login?"** They can, if you build it — but the design
says no. Ask the admin for the numbers. A login exists to *do* something, and
reading a total is not that.
