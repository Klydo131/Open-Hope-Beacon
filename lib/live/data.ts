// Talking to a real database.
//
// This is the live twin of lib/demo/store.tsx. The demo keeps everything in the
// browser and can afford to be relaxed, because the only data it can damage is
// sample data in your own tab. This file talks to a database with real people
// in it, so the rules are different and worth stating before the code.
//
// ---------------------------------------------------------------------------
// THE FOUR RULES THIS FILE IS BUILT ON
// ---------------------------------------------------------------------------
//
// 1. THE DATABASE DECIDES, NOT THIS FILE. Every function below asks for what it
//    wants and lets row level security return what the caller is entitled to.
//    None of them filters "for security" in JavaScript. A check in this file
//    protects nobody: the browser can call PostgREST directly with the same
//    key, and anything only this file enforces is enforced nowhere. Where you
//    see a filter here it is for correctness or for fewer rows, never for
//    access — and it is commented as such.
//
// 2. NOTHING HERE SETS role, church_id, is_approved OR is_head_executive ON
//    YOURSELF. There is deliberately no setMyRole() in this file, though the
//    demo store has one. In the demo it is a toy for exploring the app; here it
//    would be a privilege escalation, and the only reason it would fail is a
//    database trigger. Do not add one. If you need to change somebody's role,
//    that is setMemberRole() and it is somebody else's row.
//
// 3. THE SERVICE ROLE KEY IS NEVER IMPORTED HERE. This file runs in the
//    browser. Anything needing to bypass RLS belongs in an Edge Function, on
//    the server, holding a secret this file cannot see.
//
// 4. AN EXPLORER IS NEVER HANDED THEIR OWN STAGE. Not "not shown it" — not
//    handed it. getMyPairing() selects the columns an Explorer may have and
//    journey_stage is not among them, so it is absent from the response rather
//    than present and undrawn. The difference matters: a field that arrives and
//    is not rendered is one careless change away from being rendered.

import {
  clearBrowserSession,
  readBrowserSession,
  saveBrowserSession,
  supabase,
  supabaseAuth,
} from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';
import type { Profile, Pairing, Message, Stage, Track, Role, JourneyEvent } from '@/lib/types';

/** Thrown when a live call is made with no database configured. */
class NotLive extends Error {
  constructor() {
    super('This build has no database configured.');
    this.name = 'NotLive';
  }
}

function db() {
  const client = supabase();
  if (!client) throw new NotLive();
  return client;
}

async function uid(): Promise<string> {
  const id = readBrowserSession()?.user.id;
  if (!id) throw new Error('You are not signed in.');
  return id;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SignInResult {
  role: Role;
  is_approved: boolean;
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  let response: Response;
  try {
    response = await fetch('/api/auth/sign-in', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
  } catch {
    throw new Error('Could not reach live sign-in. Please try again.');
  }

  const payload = await response.json().catch(() => null);
  if (
    !response.ok ||
    !payload?.profile ||
    typeof payload?.session?.access_token !== 'string' ||
    typeof payload?.session?.refresh_token !== 'string'
  ) {
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : 'Could not reach live sign-in. Please try again.',
    );
  }

  try {
    saveBrowserSession(payload.session as Session);
  } catch {
    throw new Error('Your account signed in, but the app could not save the session.');
  }
  return payload.profile as SignInResult;
}

export async function signUp(email: string, password: string, fullName: string): Promise<void> {
  if (password.length < 10) throw new Error('Use at least 10 characters.');
  const client = supabaseAuth();
  if (!client) throw new NotLive();
  const { error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    // full_name only. A client cannot ask to be created as an admin: the
    // profile trigger reads this metadata and writes nothing but the name, and
    // is_approved defaults to false regardless of what is sent.
    options: { data: { full_name: fullName.trim() } },
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  clearBrowserSession();
}

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------

export async function getMyProfile(): Promise<Profile | null> {
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .eq('id', await uid())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile) ?? null;
}

/**
 * Update your own profile.
 *
 * The patch is REBUILT rather than spread, so a caller that passes
 * `{ role: 'admin' }` — by mistake or on purpose — sends nothing of the sort.
 * The database would refuse it anyway (lock_privileged_profile_columns raises),
 * but a request that never carries the field cannot be the request that gets
 * through when somebody edits that trigger.
 */
export async function updateMyProfile(patch: Partial<Profile>): Promise<void> {
  const safe = {
    full_name: patch.full_name,
    preferred_contact: patch.preferred_contact,
    preferred_language: patch.preferred_language,
    topics_of_interest: patch.topics_of_interest,
  };
  for (const k of Object.keys(safe) as (keyof typeof safe)[]) {
    if (safe[k] === undefined) delete safe[k];
  }
  if (Object.keys(safe).length === 0) return;

  const { error } = await db().from('profiles').update(safe).eq('id', await uid());
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// The church and its people
// ---------------------------------------------------------------------------

export interface Church {
  id: string;
  name: string;
}

export async function myChurch(): Promise<Church | null> {
  const { data, error } = await db().from('churches').select('id, name').limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Church) ?? null;
}

export async function renameChurch(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A church needs a name.');
  const { error } = await db().from('churches').update({ name: trimmed }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createChurch(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('A church needs a name.');
  const { data, error } = await db().rpc('create_church', { p_name: trimmed });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Everyone this caller may see.
 *
 * No church filter, deliberately. `profiles_read_church` already scopes this to
 * churches the caller manages, and adding `.eq('church_id', mine)` here would
 * be a second, weaker copy of that rule which an Executive Director overseeing
 * two churches would then have to fight.
 */
export async function listMembers(): Promise<Profile[]> {
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

/** Approve somebody, and give them the role they were approved as. */
export async function approveMember(userId: string, role: Role): Promise<void> {
  if (userId === (await uid())) throw new Error('Somebody else has to approve you.');
  const { error } = await db()
    .from('profiles')
    .update({ is_approved: true, role })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

/** Suspend somebody's workspace access without deleting their account. */
export async function disapproveMember(userId: string): Promise<void> {
  if (userId === (await uid())) throw new Error('You cannot disapprove your own account.');
  const { error } = await db()
    .from('profiles')
    .update({ is_approved: false })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function setMemberRole(userId: string, role: Role): Promise<void> {
  // Not a security control — the trigger raises on a self-edit regardless. It
  // is here so the person gets "somebody else has to do that" instead of a
  // database error they cannot act on.
  if (userId === (await uid())) throw new Error('You cannot change your own role.');
  const { error } = await db().from('profiles').update({ role }).eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function removeMember(userId: string): Promise<void> {
  if (userId === (await uid())) throw new Error('You cannot remove yourself.');
  const { error } = await db().from('profiles').delete().eq('id', userId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Pairings
// ---------------------------------------------------------------------------

export interface PairingView extends Pairing {
  dm_name: string;
  ds_name: string;
}

/** What an Explorer is allowed to know about their own pairing. */
export interface MyPairing {
  id: string;
  dm_id: string;
  dm_name: string;
  track: Track;
  status: string;
}

export async function listPairings(): Promise<PairingView[]> {
  const client = db();
  const [{ data: pairs, error }, { data: people }] = await Promise.all([
    client.from('pairings').select('*').order('created_at', { ascending: false }),
    client.from('profiles').select('id, full_name'),
  ]);
  if (error) throw new Error(error.message);
  const name = new Map((people ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? '']));
  return (pairs ?? []).map((p: Pairing) => ({
    ...p,
    dm_name: name.get(p.dm_id) ?? 'Someone',
    ds_name: name.get(p.ds_id) ?? 'Someone',
  }));
}

/**
 * The Explorer's own pairing, WITHOUT the stage.
 *
 * The column list is the access control. `select('*')` here would put
 * journey_stage in the browser of the person the stage is about, and the only
 * thing standing between that and a screen would be somebody remembering not
 * to render it. The type has no stage either, so a future edit reaching for one
 * fails to compile.
 */
export async function getMyPairing(): Promise<MyPairing | null> {
  const me = await uid();
  const client = db();
  const { data, error } = await client
    .from('pairings')
    .select('id, dm_id, track, status')
    .eq('ds_id', me)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: guide } = await client
    .from('profiles')
    .select('full_name')
    .eq('id', (data as { dm_id: string }).dm_id)
    .maybeSingle();

  return {
    ...(data as Omit<MyPairing, 'dm_name'>),
    dm_name: (guide as { full_name: string | null } | null)?.full_name ?? 'your Guide',
  };
}

export async function createPairing(dmId: string, dsId: string, track: Track): Promise<void> {
  if (dmId === dsId) throw new Error('Somebody cannot be paired with themselves.');
  const { error } = await db()
    .from('pairings')
    // An Explorer is never at Create. By the time an account is paired, the
    // church has already made contact; the shared relationship starts here.
    .insert({
      dm_id: dmId,
      ds_id: dsId,
      track,
      journey_stage: 'connect',
      created_by: await uid(),
    });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export async function inviteMember({
  email,
  role,
  fullName,
  recommendedBy,
}: {
  email: string;
  role: Role;
  fullName: string;
  recommendedBy?: string;
}): Promise<void> {
  const client = db();
  const { data, error } = await client.functions.invoke('invite', {
    body: {
      email: email.trim().toLowerCase(),
      role,
      full_name: fullName.trim(),
      recommended_by: recommendedBy,
    },
  });

  if (error) {
    // functions-js exposes the response on context for non-2xx results. Read
    // the function's useful reason instead of showing "non-2xx status code".
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      let reason = '';
      try {
        const body = (await response.clone().json()) as { error?: string };
        reason = body.error ?? '';
      } catch {
        // If the response was not JSON, fall back to the SDK message below.
      }
      if (reason) throw new Error(reason);
    }
    throw new Error(error.message);
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: unknown }).error));
  }
}

const ORDER: Stage[] = ['create', 'connect', 'care', 'call', 'cultivate', 'commission'];

/**
 * Move a pairing one step along, and record who moved it.
 *
 * Reads the stage first rather than trusting a stage passed in: two Guides on
 * two devices would otherwise both write "connect → care" from the same stale
 * view, and the journey would show one step where two happened.
 */
export async function advanceStage(pairingId: string): Promise<Stage | null> {
  const client = db();
  const { data, error } = await client
    .from('pairings')
    .select('journey_stage')
    .eq('id', pairingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const from = (data as { journey_stage: Stage }).journey_stage;
  const next = ORDER[ORDER.indexOf(from) + 1];
  if (!next) return null;

  const { error: upErr } = await client
    .from('pairings')
    .update({ journey_stage: next, updated_at: new Date().toISOString() })
    .eq('id', pairingId);
  if (upErr) throw new Error(upErr.message);

  await client
    .from('journey_events')
    .insert({ pairing_id: pairingId, from_stage: from, to_stage: next, changed_by: await uid() });
  return next;
}

export async function endPairing(id: string): Promise<void> {
  const { error } = await db().from('pairings').update({ status: 'archived' }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listJourney(pairingId: string): Promise<JourneyEvent[]> {
  const { data, error } = await db()
    .from('journey_events')
    .select('*')
    .eq('pairing_id', pairingId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as JourneyEvent[];
}

// ---------------------------------------------------------------------------
// The conversation
//
// Read by exactly two people, enforced by one policy with no leadership branch.
// If you are here to add "so a Director can review a conversation", that is a
// change to what this app is, not a feature.
// ---------------------------------------------------------------------------

export async function listMessages(pairingId: string): Promise<Message[]> {
  const { data, error } = await db()
    .from('messages')
    .select('*')
    .eq('pairing_id', pairingId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function sendMessage(pairingId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) return;
  if (text.length > 4000) throw new Error('That message is too long.');
  const { error } = await db()
    .from('messages')
    .insert({ pairing_id: pairingId, sender_id: await uid(), body: text });
  if (error) throw new Error(error.message);
}

/** Mark the other person's messages as read. Never your own. */
export async function markRead(pairingId: string): Promise<void> {
  const me = await uid();
  const { error } = await db()
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('pairing_id', pairingId)
    .neq('sender_id', me)
    .is('read_at', null);
  if (error) throw new Error(error.message);
}

/**
 * Live updates for one conversation.
 *
 * Realtime respects RLS, but only if the publication is configured for it —
 * see docs/BUILD-YOUR-OWN.md. The filter here is for traffic, not for privacy:
 * a subscription without it would still deliver only rows the caller may read,
 * it would just deliver more of them.
 */
export function subscribeToMessages(pairingId: string, onChange: () => void) {
  const client = supabase();
  if (!client) return () => {};
  const channel = client
    .channel(`messages:${pairingId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `pairing_id=eq.${pairingId}` },
      onChange,
    )
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Blog.
//
// A Guide writes once, to the people they walk with. See migration 0006.
//
// As everywhere else in this file, nothing here filters by who may see what —
// row level security does that, and the queries are deliberately identical for
// every caller. A Guide asking for their posts gets their own; an Explorer
// asking for the feed gets what was published to them. The one exception is the
// reader count, which cannot be a policy because it is an aggregate: it comes
// from a SECURITY DEFINER function that returns a number and never the names
// behind it.
// ---------------------------------------------------------------------------

export type BlogVisibility = 'private' | 'published';
export type BlogAudienceKind = 'all' | 'selected';

/** A post as its author sees it: with the count, and who it was addressed to. */
export interface MyBlogPost {
  id: string;
  title: string;
  body: string;
  visibility: BlogVisibility;
  audience: BlogAudienceKind;
  created_at: string;
  updated_at: string | null;
  reader_count: number;
  audience_ids: string[];
}

/** A post as a reader sees it. No count, no audience — neither is their business. */
export interface FeedPost {
  id: string;
  author_id: string;
  title: string;
  body: string;
  created_at: string;
}

/** The caller's own posts, drafts included, each with its reader count. */
export async function listMyBlogPosts(): Promise<MyBlogPost[]> {
  const { data, error } = await db().rpc('my_blog_posts');
  if (error) throw new Error(error.message);
  return (data ?? []) as MyBlogPost[];
}

/**
 * What this caller may read. The policy decides; this asks for everything.
 *
 * A Guide's own published posts come back here too, which is why the caller
 * filters by author — a Guide's feed should show what was written FOR them,
 * not an echo of their own writing.
 */
export async function listBlogFeed(): Promise<FeedPost[]> {
  const { data, error } = await db()
    .from('blog_posts')
    .select('id, author_id, title, body, created_at')
    .eq('visibility', 'published')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FeedPost[];
}

/**
 * Write one. `church_id` is pinned to the caller's own church by the policy, so
 * sending a different one is rejected by the database rather than by this code.
 */
export async function createBlogPost(m: {
  title: string;
  body: string;
  visibility: BlogVisibility;
  audience: BlogAudienceKind;
  dsIds?: string[];
}): Promise<string> {
  const supabase = db();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const { data: me } = await supabase
    .from('profiles').select('church_id').eq('id', uid).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');

  const { data, error } = await supabase
    .from('blog_posts')
    .insert({
      author_id: uid,
      church_id: me.church_id,
      title: m.title.trim(),
      body: m.body.trim(),
      visibility: m.visibility,
      audience: m.audience,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  // Named recipients only when the post is addressed to some rather than all.
  // Writing them for an 'all' post would leave rows that quietly become wrong
  // the moment the Guide is paired with somebody new.
  if (m.audience === 'selected' && m.dsIds?.length) {
    const { error: audErr } = await supabase
      .from('blog_audience')
      .insert(m.dsIds.map((ds) => ({ post_id: data.id as string, ds_id: ds })));
    if (audErr) throw new Error(audErr.message);
  }
  return data.id as string;
}

/** Publish a draft, or take a post off the front page without losing it. */
export async function setBlogVisibility(id: string, visibility: BlogVisibility): Promise<void> {
  const { error } = await db()
    .from('blog_posts')
    .update({ visibility, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Delete. The audience rows and the views go with it, by foreign key cascade. */
export async function deleteBlogPost(id: string): Promise<void> {
  const { error } = await db().from('blog_posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Record that the caller read a post.
 *
 * Deliberately never throws. A view that fails to record is not worth showing
 * anybody an error about, and certainly not worth interrupting their reading
 * for. The function is idempotent per person, so calling it on every page load
 * is correct rather than merely harmless.
 */
export async function recordBlogView(id: string): Promise<void> {
  try {
    await db().rpc('record_blog_view', { p: id });
  } catch {
    // Counting is a convenience for the writer, never a gate for the reader.
  }
}
