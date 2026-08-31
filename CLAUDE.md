# CLAUDE.md — Open Hope Beacon

Claude and Codex work from one map. The brief — the two halves of the app, the
product rules that outrank a request, how authorisation works, migrations, the
verify gate, the phone rules and the two-agent protocol — is
[`AGENTS.md`](./AGENTS.md). **Read that first.**

This file adds only what is specific to a Claude session.

## Before you finish

- `npm run verify` must pass. It is typecheck, build and every guardrail, and CI
  runs the same thing on Ubuntu, macOS and Windows.
- Break each new check on purpose and watch it go red before you trust it.
- Push to `main`; that is the only branch Vercel builds Production from.
- Report **"pushed, build not observed"**. This sandbox cannot reach the
  deployed site, so nothing here can honestly be called live.

## What this session cannot do, and must say so

- No browser session for the signed-in app, so live screens have not been seen
  rendered. Say which screens those were.
- No WebKit, so Safari and iOS behaviour is unverified whatever Chromium showed.
- No reach to the deploy platform, so "it is deployed" is never a claim this
  session is entitled to make.

Say plainly which of the two happened — done, or blocked. A constraint hit is
not a design decision made, and the fallback's reasoning belongs in a separate
sentence from the reason you had to fall back.

## The repository is public

Nothing that identifies a real member belongs in a tracked file, including
commit messages. When a live check informs a decision, record what you learned,
not the row you read.
