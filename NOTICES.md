# Notices

Third-party code and content in Open Hope Beacon, and the terms it is used
under. Open Hope Beacon itself is licensed under the AGPL-3.0 — see
[LICENSE](LICENSE).

---

## Open Morbital — playlists and the queue player

**Upstream:** <https://github.com/Klydo131/open_morbital_official>
**Upstream licence:** GNU AGPL-3.0-or-later
**Used here under:** MIT, by grant of the copyright holder

`lib/playlists.ts` and `components/Playlists.tsx` are derived from Open
Morbital, a local-first music player by the same author as this project.

**The reason this section exists has changed, and the record should say so.**

When the playlists were ported, Open Hope Beacon was MIT. Open Morbital is
AGPL-3.0, and taking AGPL code into an MIT project under its published terms
would have made the whole of Open Hope Beacon AGPL — contradicting a README
that promised forks "no strings". Klydo131 holds the copyright in both projects
and granted this use under MIT terms instead, which is what kept the promise.

**Open Hope Beacon became AGPL-3.0 itself in August 2026**, so that conflict no
longer exists: Open Morbital's own terms would have been fine. The MIT grant
still stands and is not withdrawn — it simply is not load-bearing any more.
Either way, this material is redistributed as part of an AGPL-3.0 work.

Note for anyone forking Open Morbital rather than this app: that grant was
specific to this project. It is not something a third-party fork can rely on.

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
all permissive (MIT, ISC, Apache-2.0, BSD). Permissive terms are compatible with
the AGPL-3.0 in this direction: a permissively licensed library can be included
in a copyleft work, and each keeps its own notice.
