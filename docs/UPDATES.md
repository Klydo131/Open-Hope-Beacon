# Updates, reminders and the update floor

Beacon updates itself. Nobody has to uninstall anything, on any device, on any
operating system. This document covers what happens on its own, how the reminder
behaves, and the one lever for a release where staying on an old build is not
acceptable.

## What happens without anyone doing anything

Every installed copy asks the server which build it is running:

- a few seconds after launch,
- every time the app is brought back to the front,
- every fifteen minutes while it is open.

The request is one small JSON document, `/version.json`, fetched with
`cache: 'no-store'`. The app compares the build id it gets back with the one
compiled into its own bundle. Different means stale, and it says so.

This check deliberately does not go through the service worker. The worker has
its own update mechanism and it is the one that failed in practice: when the
browser decides the worker script has not changed, the app reports "no update"
forever while the server has moved on several releases, and the only way out was
to uninstall and reinstall. Comparing build ids needs no cooperation from
anything that might already be broken.

## The reminder

When a newer build exists, a reminder appears at the top of the screen.

| | Gentle | Insistent |
|---|---|---|
| When | A newer build exists | The build is older than the floor |
| Says | **Update ready** | **Please update** |
| Button | Restart | Update |
| "×" puts it away for | 8 hours | 1 hour |

**"×" is a snooze, not a dismissal.** It comes back. That is the part that used
to be missing: dismissing the old banner silenced it until the app was closed and
reopened, which on an installed app can be weeks.

Nothing here traps anybody. Both tempers can be put away, and reminders can be
switched off completely.

### The switch

Settings, under **App version**: *Remind me about updates*. **On by default.**
Turning it off silences the banner entirely and nothing else: Settings still
reports the version, still has **Check for updates**, and still has **Force a
fresh copy**. The hint under the switch says so, because turning off the nag is
not the same as saying you never want to update.

The setting is per device, in `localStorage`, because what is being decided is
how one phone behaves.

### The rest of Settings

**App version** shows the build, when it was last checked, and a one-tap
**Restart to update** when a new build is waiting. One tap replaces the app in
place. Saved files, sample data and settings are all kept.

If a copy is genuinely wedged, **Force a fresh copy** throws away the service
worker and every cache and downloads the app again. It touches nothing in
`localStorage` or IndexedDB, so it is safe to tell anybody to press it. It
exists so "uninstall and reinstall" never has to be the answer.

## The floor

All of the above is an offer. Someone can snooze indefinitely, and a phone that
has been closed for two months will happily run a two-month-old bundle. That is
fine for a cosmetic release. It is not fine for one that changes what a screen is
allowed to show, where two people on two different builds would get two different
answers to the same question.

So the server can publish the oldest build it still supports. A copy older than
that gets the insistent reminder instead of the gentle one.

**The floor is off by default and should stay off.** Raise it for one release,
lower it afterwards. An insistent reminder only works while it is rare enough to
be believed.

### Raising it

One environment variable in the hosting project:

```text
BEACON_MIN_BUILD_TIME=2026-08-06T12:00:00Z
```

Any timestamp `Date.parse` understands. It means "every copy built before this
moment gets nagged harder". The natural value is the build time of the release
that introduced the change, printed by the build (`build stamped: <id> (<time>)`)
and served at `/version.json` as `time`.

Most hosts read environment variables at deploy time, so **setting the variable
requires a redeploy to take effect.** Changing it in a dashboard alone does
nothing.

### Lowering it

Clear the variable and redeploy. Nothing else has to be undone.

### The guard rails

In `lib/min-build.mjs`, covered by `tests/min-build.mjs`:

| Situation | What happens |
|---|---|
| Variable unset | No floor. Everyone gets the gentle reminder. |
| Variable empty or whitespace | No floor. |
| Value cannot be parsed as a date | **No floor**, and nothing is guessed. |
| Value is *later* than the server's own build | **Clamped** to the server's build. |
| Bundle has no readable build stamp | Never escalated. |
| Bundle is exactly at the floor | Not escalated. |

The clamp is the important one. A floor set past the newest build that exists
would nag every copy in the world, including one installed thirty seconds ago,
about an update that has not been built and cannot be downloaded. That is a
reminder nobody can ever satisfy, and it teaches people to ignore reminders. With
the clamp, the worst a mistyped floor can do is "everybody has to be on the
newest build", which is a state people can reach.

## Where the pieces are

| File | What it does |
|---|---|
| `lib/min-build.mjs` | The rule. Resolves the published floor and compares a bundle against it. |
| `lib/update-prefs.ts` | On/off, snooze windows, and how long each lasts. |
| `app/version.json/route.ts` | Publishes `build`, `time`, `minBuildTime`, `latestNote`. |
| `lib/app-update.ts` | Shared update state, including `'required'`. |
| `components/VersionWatch.tsx` | Asks the server on load, on focus and every 15 minutes. |
| `components/UpdateBanner.tsx` | Both tempers of the reminder. |
| `app/settings/page.tsx` | The **App version** card and the reminder switch. |
| `scripts/stamp-build.mjs` | Writes one build id and time into `lib/build-info.ts`. |

`stamp-build.mjs` matters more than it looks. The build id used to be computed
inside `next.config.mjs`, which is evaluated more than once, so the browser bundle
and the server route ended up with different ids, disagreed, and the app announced
an update that did not exist forever. An update prompt that is always on is worse
than no prompt, because people learn to ignore it.

## Proving it

```bash
node tests/min-build.mjs          # the rule: 23 assertions, no browser needed
npm run verify                    # static guards, includes the above
npm run verify:all                # adds tests/e2e/update-reminder.js
```

`tests/e2e/update-reminder.js` drives a real browser: it confirms the live route
publishes `minBuildTime: null`, that a newer build produces the gentle reminder,
that a floor above the running bundle produces the insistent one, that "×"
records a real snooze of about the right length in each case, that the Settings
switch silences the banner while Settings itself keeps telling the truth, and
that one tap updates without an uninstall. It injects the floor by intercepting
`/version.json`, because a single honest deployment can never declare itself too
old.
