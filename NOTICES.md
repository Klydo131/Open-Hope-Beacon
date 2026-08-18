# Notices

Third-party code and content in Open Hope Beacon, and the terms it is used
under. Open Hope Beacon itself is MIT licensed — see [LICENSE](LICENSE).

---

## Open Morbital — playlists and the queue player

**Upstream:** <https://github.com/Klydo131/open_morbital_official>
**Upstream licence:** GNU AGPL-3.0-or-later
**Used here under:** MIT, by grant of the copyright holder

`lib/playlists.ts` and `components/Playlists.tsx` are derived from Open
Morbital, a local-first music player by the same author as this project.

**Why this needed saying out loud.** Open Morbital is published under the
AGPL-3.0, which is strongly copyleft: taking AGPL code into this repository
under its published terms would have made the whole of Open Hope Beacon AGPL,
and every church that modified a deployment would have been legally obliged to
publish its source. This project's README promises the opposite — "fork it, no
permission required and no strings" — and quietly breaking that promise would
have been worse than not having playlists.

Klydo131 holds the copyright in both projects and has granted this use under
MIT terms. That grant is what keeps Hope Beacon MIT; it is not something a
third-party fork of Open Morbital could rely on.

**What was actually taken.** The data model — a named, ordered list of track
ids, with shuffle and repeat over a queue — and the behaviour. The code is
written against this app's own storage rather than copied: Open Morbital is
Vite with zustand and Dexie, and this is Next.js reading the IndexedDB store
that already lives in `lib/localMedia.ts`.

---

## Fonts

Inter and JetBrains Mono are used under the SIL Open Font License 1.1.

---

## Everything else

The remaining dependencies are listed in `package.json` with their own licences,
all permissive (MIT, ISC, Apache-2.0, BSD). `npm run build` does not bundle any
copyleft dependency.
