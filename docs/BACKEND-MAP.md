# The backend, on one page

Read this before changing anything in `supabase/`. It is the map the rest of the
docs assume you already have.

Everything here was read out of the **live database** on 9 September 2026, not
transcribed from the migrations. Where the two ever disagree, the database is
the truth and the migration that drifted is the bug.

---

## The one idea

**The database decides who may see what. Nothing else does.**

Not the browser, not `lib/live/data.ts`, not the screen. Every query the app
makes goes through PostgREST as the signed-in person, and row level security
returns the rows they are entitled to. A filter written in JavaScript protects
nobody: the browser can call PostgREST directly with the same public key, so
anything only the client enforces is enforced nowhere.

That is why `lib/live/data.ts` opens with four rules and why its functions look
so plain. They ask for what they want. The answer is already correct.

---

## The vocabulary

Almost every policy in the system is written from these predicates. Learn
these nine and you can read any policy in the codebase.

| Predicate | True when |
|---|---|
| `is_approved_user()` | you are signed in **and** a Director has approved you |
| `auth_role()` | your role: `ds` · `dm` · `admin` · `executive` |
| `my_church_id()` | the church you belong to |
| `can_access_church(c)` | you belong to `c`, or you oversee it |
| `manages_church(c)` | you are an admin of `c`, or an executive over it |
| `leads_church(c)` | leadership of `c`, for the discipline record |
| `in_pairing(p)` | you are one of the two people in pairing `p`, and still approved |
| `is_paired_with(x)` | you walk with `x`, either direction |
| `in_trial(t)` | you are a party to hearing `t` |

They are all `SECURITY DEFINER`, which is deliberate: a policy on `pairings`
that read `pairings` directly would re-enter its own policy and Postgres would
refuse the query outright with *"infinite recursion detected in policy"*. That
happened once, on a sibling deployment, and it took two screens down together.
Every cross-table test goes through one of these instead.

---

## Every table, and who may read it

47 tables. **Row level security is on for all 47.** No exceptions, and the
verify gate fails if a new one arrives without it.

### The people

| Table | Who may read | Live |
|---|---|---|
| `profiles` | `manages_church` — plus your own row and the people you walk with, through narrower policies | ● |
| `churches` | `can_access_church` | ● |
| `church_executives` | `can_access_church` | |
| `invites` | `manages_church` | ● |
| `recommendations` | the Guide who made it, or `manages_church` | ● |
| `profile_changes` | `is_paired_with` | ● |

### The relationship

| Table | Who may read | Live |
|---|---|---|
| `pairings` | the two people in it, or `manages_church` | ● |
| `pairing_requests` | the Guide who asked, or `leads_church` | ● |
| `messages` | `in_pairing` | ● |
| `pairing_media` | `in_pairing` | ● |
| `meetings` | `in_pairing` | ● |
| `journey_events` | the Guide, or `manages_church` | ● |
| `seeker_notes` | **the author alone** | |
| `follow_ups` | the owner alone | ● |
| `prayer_requests` | the person who asked, or whoever walks with them | ● |
| `prayer_encouragements` | same as the request it belongs to | ● |

### The library and the studies

| Table | Who may read | Live |
|---|---|---|
| `materials` | yours, or `can_read_material` | ● |
| `material_shares` | `in_pairing` | ● |
| `material_hides` | yours alone | ● |
| `lesson_series` | published in your church, yours, `manages_church`, or shared to you as a Guide | ● |
| `lessons` | through the series they belong to | ● |
| `lesson_files` | through the lesson | ● |
| `lesson_reads` | `may_see_reading` | ● |
| `lesson_assignments` | `in_pairing` | ● |
| `lesson_guide_shares` | `manages_church`, or the Guide it was shared with | |

### The church's voice

| Table | Who may read | Live |
|---|---|---|
| `announcements` | your church | ● |
| `blog_posts` | yours, or `can_read_post` | ● |
| `blog_audience` | the author of the post | |
| `guide_room_messages` | `in_guide_room` | ● |
| `guilds` · `guild_members` | your church, or leadership over it | ● |
| `notifications` | yours alone | ● |

### Safeguarding

| Table | Who may read | Live |
|---|---|---|
| `reports` · `report_files` | an approved **admin or executive of that church** | ● |
| `trials` · `trial_statements` · `trial_parties` | `in_trial` — a party to that hearing, nobody else | ● |
| `discipline_log` | `leads_church` | ● |
| `feedback` | `manages_church`, or its author | ● |
| `activity_record` | `manages_church` | |

---

## The eight tables with no policy at all

`app_settings` · `blog_views` · `guild_activity_posts` · `guild_activity_amens`
· `library_activity` · `library_blocks` · `pairing_library_permissions` ·
`security_audit_events`

RLS on, zero policies, which in Postgres means **deny everything**. Nothing
reads these directly. They are reached through `SECURITY DEFINER` functions that
apply their own rule and often return *less* than the row holds — the guild feed
computes an `author_label` rather than handing over `author_id`, so it decides
how much of a writer's identity each reader sees.

**This is a deliberate pattern, and it has one sharp consequence.**

> A table with no policy can never be watched over realtime. Realtime evaluates
> the same policies as a `SELECT`, so it delivers to nobody — and the screen
> looks perfectly wired while staying frozen.

That trap has been walked into three times. `tests/every-room-keeps-up.mjs` now
refuses a `KEEP_UP_` set that names a table with no read policy, which is why
the library's record watches `materials` and `material_shares` — the two tables
whose triggers *write* its rows — instead of the record itself.

The Guild Room's wall is the one screen that still reloads, because there is no
cause table to watch and the only repair that would work would expose the author
column the feed exists to hide.

---

## Where the rules live

```
supabase/migrations/     the only place schema or policy changes exist
supabase/functions/      the edge functions, which hold the service key
lib/live/data.ts         every browser query, one function per thing
lib/live/keep-up.ts      which tables each screen listens to
tests/                   one file per rule, each broken on purpose before trust
scripts/verify.mjs       the gate: typecheck, build, and every test above
```

### Three rules that bite

1. **Migrations are append-only.** They have run against a live database with
   real people in it. Fixing a migration means writing the next one; editing a
   file that has already run puts the repository and the database into a
   disagreement nobody can see.

2. **A definer function must authorise its own caller.** It runs as its owner,
   so RLS does not protect it. Every one that *acts* — `suspend_member`,
   `close_trial`, `remove_member_by_leader` — checks the caller first. That
   check is the only thing standing there.

3. **Never widen a policy to make a screen convenient.** The screen is the
   cheaper thing to change. Every time this has come up the answer has been to
   watch a different table, show a different card, or accept a reload.

---

## How to satisfy yourself it is true

```bash
npm run verify                       # typecheck, build, and every guardrail
node tests/every-room-keeps-up.mjs   # the realtime rules, on their own
```

And against a live database, the two questions worth asking after any change:

```sql
-- Nothing may be readable by accident.
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- Nothing may be watched that cannot be read.
select p.tablename from pg_publication_tables p
join pg_class c on c.relname = p.tablename
left join pg_policy pol on pol.polrelid = c.oid and pol.polcmd in ('r','*')
where p.pubname = 'supabase_realtime' and p.schemaname = 'public'
group by p.tablename having count(pol.polname) = 0;
```

Both should return nothing. The first has returned nothing since the beginning.
The second returned five rows on 9 September 2026, and that is the bug this
page was written after fixing.
