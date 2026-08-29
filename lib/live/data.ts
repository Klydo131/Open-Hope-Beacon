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
import { uuid } from '@/lib/uuid';
import type { Session } from '@supabase/supabase-js';
import type { Profile, Pairing, Message, Stage, Track, Role, JourneyEvent, MeetingMode } from '@/lib/types';

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

/**
 * Who is signed in, from the session this app already verified.
 *
 * USE THIS, NEVER the Auth client's own getUser. Eleven calls in this file
 * drifted onto it while features were being added, and each one is a second
 * network round trip to the Auth server before the query the caller actually
 * wanted. That is not just slow — a browser with tracking protection on
 * (Safari, Brave, Firefox in strict mode) can fail that request while the
 * session itself is perfectly good, so the feature reports "not signed in" to
 * somebody who is signed in, on their phone, in the middle of a conversation.
 *
 * The session in local storage was verified server-side by /api/auth/sign-in
 * before it was ever written. Reading the id out of it asks nobody anything.
 * lib/supabase/client.ts takes the access token from the same place, for the
 * same reason.
 */
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
    // The sign-up fields added in 0013. Listed one by one for the same reason
    // the four above are: this object is an allow-list, and the moment it
    // becomes a spread it stops being one.
    birthday: patch.birthday,
    gender: patch.gender,
    life_status: patch.life_status,
    city_of_residence: patch.city_of_residence,
    work_industry: patch.work_industry,
    consent_at: patch.consent_at,
    // A face. Not privileged: unlike role or guardian consent these are yours
    // to change, and a member editing their own picture is the whole point.
    avatar: patch.avatar,
    photo_path: patch.photo_path,
  };
  for (const k of Object.keys(safe) as (keyof typeof safe)[]) {
    if (safe[k] === undefined) delete safe[k];
  }
  if (Object.keys(safe).length === 0) return;

  const { error } = await db().from('profiles').update(safe).eq('id', await uid());
  if (error) throw new Error(error.message);
}

/**
 * What this person has changed about their own details, newest first.
 *
 * Readable by that member, by the Guide currently paired with them, and by
 * their church's leadership -- migration 0035 sets those three policies and
 * nothing else, so this call needs no role check of its own. Asking for
 * somebody you are not walking with returns an empty list rather than an
 * error, which is what a row level security refusal looks like from here and
 * is the right shape: absence of permission should not confirm existence.
 */
export interface ProfileChange {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

/** The field names, in words a Guide would use rather than column names. */
export const PROFILE_FIELD_LABEL: Record<string, string> = {
  full_name: 'Name',
  preferred_contact: 'Contact',
  preferred_language: 'Language',
  birthday: 'Birthday',
  gender: 'Gender',
  life_status: 'Status',
  city_of_residence: 'City',
  work_industry: 'Work',
};

export async function listProfileChanges(personId: string, limit = 20): Promise<ProfileChange[]> {
  const { data, error } = await db()
    .from('profile_changes')
    .select('id, field, old_value, new_value, changed_at')
    .eq('profile_id', personId)
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProfileChange[];
}

// withdrawMyConsent() was here, and is gone on purpose. It called
// withdraw_my_consent(), which migration 0035 drops.
//
// A member now keeps their details accurate rather than being able to erase
// them, and every edit is recorded for their Guide and Director to see. Leaving
// the function behind an unused screen would have left a SECURITY DEFINER route
// to clearing somebody's details reachable by anything holding a session --
// which is not a dead function, it is an undocumented one.

// ---------------------------------------------------------------------------
// Who has been invited, and who has not arrived yet
// ---------------------------------------------------------------------------

export interface OpenInvite {
  id: string;
  email: string;
  role: Role;
  full_name: string | null;
  created_at: string;
  expires_at: string;
  /**
   * An auth account exists for this address. NOT the same as having joined —
   * sending an invitation creates the account, so this is true for nearly
   * every row here. Its ABSENCE is the useful half: no account means the send
   * never got far enough to make one, so no message can have arrived.
   */
  has_account: boolean;
  /**
   * When the invitation link was last opened — by somebody. Not proof it was
   * the invited person: a Director who copies the link and opens it to check
   * it works stamps this too.
   */
  opened_at: string | null;
  /**
   * When they finished the sign-up form and chose their own password.
   *
   * THIS IS WHAT "ACCEPTED" MEANS, and two earlier answers were wrong.
   * invites.redeemed_at is stamped when the auth row is created, which is the
   * moment the invitation is SENT — so it read "joined today" for people who
   * had never opened their email. last_sign_in_at is stamped by opening the
   * link, which a Director testing one does on their own device — so it read
   * "joined" for people who had never touched anything. Submitting the form is
   * the only step that cannot happen by accident.
   */
  joined_at: string | null;
}

/**
 * Invitations this church has sent.
 *
 * The point of this list is the ones that have NOT been accepted. An invitation
 * that silently failed to send looks exactly like one the person has not got
 * round to opening, and until this existed there was nowhere at all to see the
 * difference — a Director pressed Invite, got a confirmation, and that was the
 * last anybody heard of it.
 */
export async function listInvites(): Promise<OpenInvite[]> {
  // Through a definer function rather than a plain select, because whether a
  // link was ever opened lives in auth.users and no browser-side policy can
  // read it. church_invitations() checks the caller leads this church before
  // it returns a single row.
  const { data, error } = await db().rpc('church_invitations');
  if (error) throw new Error(error.message);
  return (data ?? []) as OpenInvite[];
}

/**
 * Mark this person's sign-up finished.
 *
 * Called once, by the join form, after the password has actually been set.
 * Nothing else may stand in for it: the account row is created when the
 * invitation is sent, and the sign-in stamp is set by opening the link, so
 * both of those are true for somebody who has done nothing at all. Choosing a
 * password is the first step that requires the invited person to be present.
 *
 * A definer that writes one column of the caller's own row, rather than an
 * ordinary update: the way profiles' no-self-promotion rule dies is somebody
 * widening the set of columns a browser may write and taking `role` along.
 */
export async function finishMySignup(): Promise<void> {
  const { error } = await db().rpc('finish_my_signup');
  if (error) throw new Error(error.message);
}

/**
 * Attach an invitation that was sent after this account already existed.
 *
 * `inviteUserByEmail` creates a new auth row, which normally lets
 * `handle_new_user` copy the invitation's church and role into the profile.
 * An already-created, unassigned account follows the recovery-email path
 * instead, so that trigger does not run again. The database function is
 * deliberately narrower than a general profile update: it can only fill the
 * current caller's unassigned, still-unapproved profile from an active invite
 * to that caller's verified account email.
 */
export async function claimMyPendingInvitation(): Promise<boolean> {
  const { data, error } = await db().rpc('claim_my_pending_invitation');
  if (error) throw new Error(error.message);
  return data === true;
}

/**
 * Withdraw an invitation that has not been accepted.
 *
 * There was no way to take one back. An invitation sent to the wrong address,
 * or with the wrong role chosen, simply stayed in the list for ever — and
 * because the one-open-invite-per-address index then blocked a corrected one,
 * a single slip made that person un-invitable until somebody went into the
 * database.
 *
 * THE FIRST VERSION OF THIS NEVER DELETED ANYTHING. It was a plain delete
 * filtered on `redeemed_at is null`, matching the invites_revoke policy — and
 * that column is stamped when the account row is created, which is the moment
 * the invitation is SENT. The condition was false for every row that has ever
 * existed. A delete that matches nothing is not an error, so the button said
 * "withdrawn" and the invitation stayed exactly where it was.
 *
 * Now a definer that checks the caller leads that church, refuses to touch
 * anybody who has finished signing up, and returns whether it deleted a row —
 * so a refusal can be shown rather than swallowed.
 */
export async function cancelInvite(id: string): Promise<void> {
  const { data, error } = await db().rpc('cancel_invitation', { p_id: id });
  if (error) throw new Error(error.message);
  if (data !== true) {
    throw new Error('That invitation could not be withdrawn. It may already have been accepted.');
  }
}

/** The address each member was invited at. Leadership of that church only. */
export async function memberContact(): Promise<Record<string, { email: string; joined_at: string }>> {
  const { data, error } = await db().rpc('church_member_contact');
  if (error) throw new Error(error.message);
  const out: Record<string, { email: string; joined_at: string }> = {};
  for (const row of (data ?? []) as { id: string; email: string; joined_at: string }[]) {
    out[row.id] = { email: row.email, joined_at: row.joined_at };
  }
  return out;
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

// removeMember USED TO LIVE HERE, AND DELETING IT IS THE FIX.
//
// It deleted the profiles row and nothing else. profiles.id references
// auth.users on delete cascade, and a cascade only runs in that direction, so
// the auth account survived every use of it -- invisible to every screen, since
// only the service role can read auth.users.
//
// Two things followed, both reported as bugs before the cause was found. The
// removed person still held a working login that resolved to no profile. And
// their address could never be invited again: member_by_email joins auth.users
// to profiles, the row was still there, and a fresh invitation was refused as
// already registered.
//
// removeMemberByLeader below is the whole act: it checks authority, writes the
// discipline log, clears messages and pairings, and deletes the auth user,
// which cascades everything else away and frees the address.

// ---------------------------------------------------------------------------
// Pairings
// ---------------------------------------------------------------------------

export interface PairingView extends Pairing {
  dm_name: string;
  ds_name: string;
  /** When the Explorer finished signing up, for the "New" badge. */
  ds_signup_completed_at?: string | null;
  // Carried so the MINOR badge can be drawn wherever a Guide or Director sees
  // this Explorer. Both are already readable here: RLS is row-level, and a
  // Guide may read the whole row of the person they are paired with, as may
  // leadership for their own church. Nothing new is exposed by asking for them.
  ds_birthday: string | null;
  ds_guardian_consent_at: string | null;
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
    // signup_completed_at rides along for the "New" badge on a Guide's cards.
    client.from('profiles').select('id, full_name, birthday, guardian_consent_at, signup_completed_at'),
  ]);
  if (error) throw new Error(error.message);
  type Row = { id: string; full_name: string | null; birthday: string | null; guardian_consent_at: string | null; signup_completed_at: string | null };
  const by = new Map((people ?? []).map((p: Row) => [p.id, p]));
  return (pairs ?? []).map((p: Pairing) => ({
    ...p,
    dm_name: by.get(p.dm_id)?.full_name ?? 'Someone',
    ds_name: by.get(p.ds_id)?.full_name ?? 'Someone',
    ds_birthday: by.get(p.ds_id)?.birthday ?? null,
    ds_guardian_consent_at: by.get(p.ds_id)?.guardian_consent_at ?? null,
    ds_signup_completed_at: by.get(p.ds_id)?.signup_completed_at ?? null,
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

/**
 * What the invite function actually reports back.
 *
 * `delivery` is the honest bit: 'email' means it left, 'link' means it did not
 * and the URL below is the only way that person is getting in. A church with no
 * mail provider configured yet is a normal state, not an error — but it has to
 * be a VISIBLE state, or invitations quietly go nowhere.
 */
export interface InviteResult {
  ok?: boolean;
  delivery?: 'email' | 'link';
  /**
   * The join link, present ONLY when `delivery === 'link'`.
   *
   * It used to be sent on every reply, and that is what broke every invitation
   * the app has ever sent. Producing this link mints a one-time token, and
   * auth.users stores exactly one such token per purpose — so generating it
   * after a successful send overwrote the token already in the recipient's
   * inbox, and their link came back "expired or already used". The screens only
   * ever read this field on the failure path anyway, so the destroyed token
   * bought nothing.
   *
   * When the mail did not go there is no token in an inbox to protect, and this
   * link is the only way that person gets in. That case is unchanged.
   */
  link?: string;
  /** Why it could not be emailed, in words a person can act on. */
  mailNote?: string;
  /**
   * Set when the ONLY thing wrong is a per-address cooldown. A number here
   * means "this will work, shortly" — a very different thing from a fault, and
   * the screen must not draw them the same way.
   */
  waitSeconds?: number;
  /** Which route carried it: the church's provider, or Supabase's own mailer. */
  via?: 'provider' | 'supabase';
  /** True when this refreshed an invitation that already existed. */
  resent?: boolean;
}

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
}): Promise<InviteResult> {
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
  // RETURN IT. This used to be Promise<void>, so the Director's screen said
  // "Invitation e-mail sent" whatever came back — including when the function
  // had plainly reported that it could not send anything and had handed back a
  // link to pass on by hand. The owner sent invitations for a day and was told
  // each time that they had gone.
  return (data ?? {}) as InviteResult;
}

const ORDER: Stage[] = ['create', 'connect', 'care', 'call', 'cultivate', 'commission'];

/**
 * Move a pairing one step along, and record who moved it.
 *
 * Reads the stage first rather than trusting a stage passed in: two Guides on
 * two devices would otherwise both write "connect → care" from the same stale
 * view, and the journey would show one step where two happened.
 */
/**
 * Move an Explorer BACK one stage, because Advance is one tap and a mistake.
 *
 * WHY THIS EXISTS. Advance was the only control. A Guide who tapped it on the
 * wrong person, or twice, had no way to put it right: the stage is on the
 * Explorer's own journey, and the only remaining fix was to ask a Director to
 * edit the database. So the app quietly recorded a decision nobody had made
 * about somebody's faith.
 *
 * IT IS A CORRECTION, NOT A DEMOTION, and the difference matters to the person
 * it is about. Nothing is deleted: the step back is written to journey_events
 * exactly like a step forward, with who did it and when, so the record shows
 * what actually happened rather than pretending the mistake never occurred.
 * That also means an Explorer's history stays honest if anybody ever reads it.
 *
 * The Explorer is never shown their stage at all, here or anywhere, so a
 * correction is invisible to them. That is deliberate: see myPairing.
 */
export async function stepBackStage(pairingId: string): Promise<Stage | null> {
  const client = db();
  const { data, error } = await client
    .from('pairings')
    .select('journey_stage')
    .eq('id', pairingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const from = (data as { journey_stage: Stage }).journey_stage;
  const back = ORDER[ORDER.indexOf(from) - 1];
  // Already at the first stage. Returning null rather than throwing: the
  // button is disabled there, and a race is not worth an error message.
  if (!back) return null;

  const { error: upErr } = await client
    .from('pairings')
    .update({ journey_stage: back, updated_at: new Date().toISOString() })
    .eq('id', pairingId);
  if (upErr) throw new Error(upErr.message);

  await client
    .from('journey_events')
    .insert({ pairing_id: pairingId, from_stage: from, to_stage: back, changed_by: await uid() });
  return back;
}

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

/**
 * Every stage change this caller may see, for the analytics screen.
 *
 * NO PAIRING FILTER, on purpose: the policy on journey_events already decides
 * who sees what, so a Director gets their church and a Guide gets their own
 * people. Reading the real events rather than approximating from a pairing's
 * updated_at matters here, because updated_at moves for reasons that are not a
 * journey step and the chart would quietly count them.
 */
/**
 * Per role: how many are on the roll, how many did something in the window, how
 * many did not, and how many are suspended.
 *
 * "ACTIVE" MEANS A RECORDED ACTION, NOT A SIGN-IN, and the screen has to say so.
 * Beacon does not log sign-ins — there is no last_seen_at and nothing writes
 * one — so a number claiming to be visits would be invented. What is real is
 * whether the app recorded this person doing something: a message, a journey
 * step on their pairing, a meeting, a post, a lesson. See migration 0043.
 *
 * Counts only. The function is SECURITY DEFINER so it can see messages a
 * Director may not read, and it returns four integers per role and never a
 * name, which is the same posture as the blog's reader count.
 */
export interface RoleActivity {
  role: Role;
  approved: number;
  active: number;
  inactive: number;
  suspended: number;
}

export async function churchActivity(days: number): Promise<RoleActivity[]> {
  const { data, error } = await db().rpc('church_activity', { p_days: days });
  if (error) throw new Error(error.message);
  return (data ?? []) as RoleActivity[];
}

// ---------------------------------------------------------------------------
// A Guide asks to walk with somebody, and the Guides talk to each other.
// See migration 0046.
// ---------------------------------------------------------------------------

/** An Explorer nobody is walking with yet, for the Guide who has room. */
export interface UnpairedExplorer {
  id: string;
  full_name: string;
  signup_completed_at: string | null;
  created_at: string;
}

/**
 * Who is waiting.
 *
 * AN RPC, AND THE FIRST VERSION OF THIS WAS WRONG. It computed the answer here
 * from listMembers() and listPairings(), on the assumption that a Guide could
 * already read both. A Guide can read exactly TWO profiles: their own and the
 * Explorer they walk with. So this returned an empty list to the only people it
 * was built for, and the panel would have shipped looking like a feature that
 * does nothing.
 *
 * Migration 0047 answers it in the database instead, returning a name and an id
 * and nothing else. That does widen what a Guide can see, deliberately: you
 * cannot ask to walk with somebody you cannot name.
 */
export async function unpairedExplorers(): Promise<UnpairedExplorer[]> {
  const { data, error } = await db().rpc('unpaired_explorers');
  if (error) throw new Error(error.message);
  return (data ?? []) as UnpairedExplorer[];
}

export interface PairingRequest {
  id: string;
  guide_id: string;
  ds_id: string;
  note: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

/**
 * The Guide's own asks, or every ask in the church for a Director.
 *
 * One query for both, because the policy already decides which rows come back
 * and a second query filtered in the app would be a second answer that can
 * disagree with the first.
 */
export async function listPairingRequests(): Promise<PairingRequest[]> {
  const { data, error } = await db()
    .from('pairing_requests')
    .select('id, guide_id, ds_id, note, status, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PairingRequest[];
}

/** Ask a Director to pair you with this Explorer. Never creates the pairing. */
export async function askToWalkWith(dsId: string, note = ''): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase
    .from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  const { error } = await supabase.from('pairing_requests').insert({
    church_id: me.church_id,
    guide_id: me_id,
    ds_id: dsId,
    note: note.trim(),
  });
  if (error) throw new Error(error.message);
}

/** A Guide takes back their own ask. */
export async function withdrawPairingRequest(id: string): Promise<void> {
  const { error } = await db().from('pairing_requests').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * A Director answers.
 *
 * Answering "yes" does NOT create the pairing. The Director still makes it on
 * the pairings screen, where the cap of five is enforced, and where they are
 * looking at everything else about that Guide. A button that silently created
 * a relationship from a list of requests is how somebody ends up with six.
 */
export async function decidePairingRequest(
  id: string,
  status: 'accepted' | 'declined',
): Promise<void> {
  const me_id = await uid();
  const { error } = await db().from('pairing_requests')
    .update({ status, decided_by: me_id, decided_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Names for the Guides' room and the pairing requests, for people in the room. */
export interface GuideRoomPerson { id: string; full_name: string; role: Role }

export async function guideRoomPeople(): Promise<GuideRoomPerson[]> {
  const { data, error } = await db().rpc('guide_room_people');
  if (error) throw new Error(error.message);
  return (data ?? []) as GuideRoomPerson[];
}

export interface GuideRoomMessage {
  id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

/** The Guides' room, oldest last so it reads like a conversation. */
export async function listGuideRoom(limit = 200): Promise<GuideRoomMessage[]> {
  const { data, error } = await db()
    .from('guide_room_messages')
    .select('id, author_id, body, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as GuideRoomMessage[]).reverse();
}

export async function postToGuideRoom(body: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase
    .from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  const { error } = await supabase.from('guide_room_messages').insert({
    church_id: me.church_id,
    author_id: me_id,
    body: body.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function deleteGuideRoomMessage(id: string): Promise<void> {
  const { error } = await db().from('guide_room_messages').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listJourneyEvents(limit = 2000): Promise<JourneyEvent[]> {
  const { data, error } = await db()
    .from('journey_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as JourneyEvent[];
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
/**
 * Who a post is for.
 *
 *   church   — everybody in the writer's church. Community Blogs.
 *   all      — the people the writer walks with. For a Guide that is their
 *              Explorers; for an Explorer it is their Guide. Leaders' `all`
 *              posts also reach their whole church, which is how the board
 *              worked before `church` existed and is left alone so nothing
 *              already published changes audience.
 *   selected — named people, and nobody else.
 */
export type BlogAudienceKind = 'all' | 'church' | 'selected';

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

/**
 * A post as a reader sees it, with a name on it.
 *
 * The reader count stays out: that is the writer's, and a reader knowing how
 * many others have read a post changes what the post is. Who wrote it does
 * belong here — a blog anyone may post to is unreadable without it.
 */
export interface FeedPost {
  id: string;
  author_id: string;
  author_name: string;
  author_role: Role;
  title: string;
  body: string;
  audience: BlogAudienceKind;
  created_at: string;
}

/** The caller's own posts, drafts included, each with its reader count. */
export async function listMyBlogPosts(): Promise<MyBlogPost[]> {
  const { data, error } = await db().rpc('my_blog_posts');
  if (error) throw new Error(error.message);
  return (data ?? []) as MyBlogPost[];
}

/**
 * What this caller may read, newest first, with the writer's name on each.
 *
 * `can_read_post` decides — the same function the table's own SELECT policy
 * uses — so this asks for everything and gets back exactly what it is allowed.
 *
 * The caller's own posts come back here too. That used to be filtered out on
 * the grounds that a Guide should see what was written FOR them; on a church
 * shared blog it is the opposite, because a post you wrote is part of the list
 * everybody else is reading and leaving it out makes the board look wrong to
 * its own author.
 */
export async function listBlogFeed(limit = 100): Promise<FeedPost[]> {
  const { data, error } = await db().rpc('blog_feed', { p_limit: limit });
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
  const me_id = await uid();

  const { data: me } = await supabase
    .from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');

  const { data, error } = await supabase
    .from('blog_posts')
    .insert({
      author_id: me_id,
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

// ---------------------------------------------------------------------------
// Prayer.
//
// Two audiences given deliberately different things (migration 0007). A Guide
// sees their own Explorers' requests WITH the name, because praying for someone
// you walk with is the point. The congregation sees shared ones with NO name,
// served by prayer_wall() rather than by a policy — a policy grants whole rows,
// and the row carries ds_id, so "leaders see the request but not who wrote it"
// would be a promise the network tab disproves in one click.
// ---------------------------------------------------------------------------

export type PrayerStatus = 'open' | 'praying' | 'answered';

/** A request as its author or their Guide sees it: with the person attached. */
export interface PrayerRequestRow {
  id: string;
  ds_id: string;
  body: string;
  share_with_church: boolean;
  status: PrayerStatus;
  created_at: string;
  /** When a Guide said they were praying for this. Null until one does. */
  praying_at: string | null;
}

/** A request as the congregation sees it. No name, no id of the person. */
export interface WallEntry {
  id: string;
  body: string;
  status: PrayerStatus;
  created_at: string;
}

/** Raise a request. church_id is pinned by the policy, not trusted from here. */
export async function addPrayerRequest(body: string, shareWithChurch: boolean): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const text = body.trim();
  if (!text) throw new Error('Write something first.');

  const { data: me } = await supabase
    .from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');

  const { error } = await supabase.from('prayer_requests').insert({
    ds_id: me_id,
    church_id: me.church_id,
    body: text,
    share_with_church: shareWithChurch,
  });
  if (error) throw new Error(error.message);
}

/**
 * The requests this caller may see WITH a name: their own if they are an
 * Explorer, their Explorers' if they are a Guide. A Director gets nothing here
 * and that is correct — they are shown the wall instead.
 */
export async function listPrayerRequests(): Promise<PrayerRequestRow[]> {
  const { data, error } = await db()
    .from('prayer_requests')
    .select('id, ds_id, body, share_with_church, status, created_at, praying_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PrayerRequestRow[];
}

/** The church wall. Anonymous by construction — see migration 0007. */
export async function listPrayerWall(): Promise<WallEntry[]> {
  const { data, error } = await db().rpc('prayer_wall');
  if (error) throw new Error(error.message);
  return (data ?? []) as WallEntry[];
}

/** Either side may move the status; only the author owns the words. */
export async function setPrayerStatus(id: string, status: PrayerStatus): Promise<void> {
  const { error } = await db().from('prayer_requests').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * A Guide says they are praying for this, and the Explorer is told.
 *
 * ONE CALL, AND IT DOES NOT SEND THE MESSAGE. The message is sent by a trigger
 * on the row (migration 0049), because a client that updates and then notifies
 * is a client that can forget the second half — or a second client, added
 * later, that never knew there was one. Telling the person is not a step
 * somebody remembers here; it is what changing the status means.
 *
 * Pressing it more than once is harmless: the trigger only fires on the move
 * INTO praying, so a Guide who taps twice does not send two messages. Proved
 * against the live database rather than assumed.
 */
export async function markPrayingFor(id: string): Promise<void> {
  const { error } = await db()
    .from('prayer_requests')
    .update({ status: 'praying' })
    .eq('id', id)
    .neq('status', 'praying');
  if (error) throw new Error(error.message);
}

/** Withdraw a request. Only the author may; a Guide cannot delete a confidence. */
export async function deletePrayerRequest(id: string): Promise<void> {
  const { error } = await db().from('prayer_requests').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Library.
//
// A resource is a title and a LINK (migration 0008). The app also has an
// on-device library that keeps files in the browser that added them — a real
// privacy property, and one that cannot move a file between two people. A link
// travels on its own; a blob in IndexedDB does not. Uploading files to object
// storage is a later, deliberate decision with a quota attached.
// ---------------------------------------------------------------------------

export type MaterialKind = 'link' | 'video' | 'audio' | 'pdf' | 'image';

export interface Material {
  id: string;
  church_id: string;
  added_by: string;
  title: string;
  description: string | null;
  kind: MaterialKind;
  external_url: string;
  is_published: boolean;
  created_at: string;
}

export interface MaterialShare {
  id: string;
  material_id: string;
  pairing_id: string;
  shared_by: string;
  note: string | null;
  created_at: string;
}

/**
 * Everything this caller may see. For a Guide that is their church's library;
 * for an Explorer it is only what was shared with them. Same query either way —
 * the policy decides, not this function.
 */
export async function listMaterials(): Promise<Material[]> {
  const { data, error } = await db()
    .from('materials')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Material[];
}

/** Add one to the church library. Guides and leaders only, by policy. */
export async function addMaterial(m: {
  title: string;
  url: string;
  kind: MaterialKind;
  description?: string;
}): Promise<string> {
  const supabase = db();
  const me_id = await uid();

  const url = m.url.trim();
  // Checked here so the person gets a sentence rather than a constraint
  // violation. The database checks it too, which is the one that counts.
  if (!/^https?:\/\//i.test(url)) throw new Error('The address needs to start with http:// or https://');

  const { data: me } = await supabase
    .from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');

  const { data, error } = await supabase
    .from('materials')
    .insert({
      church_id: me.church_id,
      added_by: me_id,
      title: m.title.trim(),
      description: m.description?.trim() || null,
      kind: m.kind,
      external_url: url,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** What has been shared into one pairing. Both people in it may read this. */
export async function listShares(pairingId: string): Promise<MaterialShare[]> {
  const { data, error } = await db()
    .from('material_shares')
    .select('*')
    .eq('pairing_id', pairingId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MaterialShare[];
}

/** Share one into a pairing. Only the Guide of that pairing may, by policy. */
export async function shareMaterial(materialId: string, pairingId: string, note?: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();

  const { error } = await supabase.from('material_shares').insert({
    material_id: materialId,
    pairing_id: pairingId,
    shared_by: me_id,
    note: note?.trim() || null,
  });
  // The unique index is the one somebody will hit, so it gets words rather
  // than a constraint name.
  if (error) {
    throw new Error(error.code === '23505' ? 'That is already shared with them.' : error.message);
  }
}

/** Unshare. Only whoever shared it may take it back. */
export async function unshareMaterial(shareId: string): Promise<void> {
  const { error } = await db().from('material_shares').delete().eq('id', shareId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Church announcements.
// ---------------------------------------------------------------------------
//
// Notices the whole church reads and only leadership writes. Kept apart from
// Community Blogs because they are different things: a blog post belongs to
// whoever wrote it and carries their name; an announcement belongs to the
// church and speaks for it.

export interface Announcement {
  id: string;
  icon: string;
  title: string;
  body: string;
  when_text: string;
  is_pinned: boolean;
  /**
   * Kept so a card can offer "take it down" to whoever wrote it, not to decide
   * who reads it. Every notice goes to the whole church; see migration 0045.
   */
  author_id: string | null;
  created_at: string;
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await db().from('announcements')
    .select('id, icon, title, body, when_text, is_pinned, author_id, created_at')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Announcement[];
}

export async function addAnnouncement(
  a: { icon?: string; title: string; body?: string; whenText?: string },
): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase.from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  const { error } = await supabase.from('announcements').insert({
    church_id: me.church_id,
    author_id: me_id,
    icon: (a.icon || '📌').slice(0, 8),
    title: a.title.trim(),
    body: (a.body || '').trim(),
    when_text: (a.whenText || '').trim(),
  });
  if (error) throw new Error(error.message);
}

/** Take a notice down without deleting it, so it can go back up. */
export async function pinAnnouncement(id: string, pinned: boolean): Promise<void> {
  const { error } = await db().from('announcements').update({ is_pinned: pinned }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await db().from('announcements').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// A face to put to the name.
// ---------------------------------------------------------------------------
//
// The bucket is the one conversation attachments already use, under an
// avatars/ prefix with its own policies: anybody signed in may READ a face
// (a Director reading a roster needs to), and you may only ever WRITE inside
// your own folder.
//
// THE PATH IS STORED, NEVER A URL. A signed URL expires, so a stored one is a
// picture that stops working after an hour with nothing to say why.

const AVATAR_BUCKET = 'pairing-media';

/** Upload a picture and return the path to store on the profile. */
export async function uploadAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('That is not a picture.');
  if (file.size > 5 * 1024 * 1024) throw new Error('That picture is over 5 MB. Try a smaller one.');
  const me = await uid();
  // The extension is taken from the MIME type, never from the filename, which
  // is attacker-controlled text that happens to be shown to people.
  const ext = file.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  const path = `avatars/${me}/${Date.now()}.${ext}`;
  const { error } = await db().storage.from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * The person you walk with, so they can be seen rather than only named.
 *
 * THE ASK: "Explorer must see the Guide's profile and image so that the
 * Explorer is aware the Guide is not a robot but a real person."
 *
 * The Explorer's screen showed the Guide's NAME and nothing else. Everything
 * else about that screen says the journey is a relationship; the one place the
 * other person appeared was a line of text, which is what a system sounds like
 * rather than somebody who agreed to walk with you.
 *
 * THE COLUMN LIST IS THE ACCESS CONTROL, and it is deliberately short. The
 * policy (profiles_read_paired, migration 0001) would return the whole row: an
 * Explorer may read their Guide's profile and the Guide may read theirs. That
 * is the right rule and it is not a reason to put every field on a screen.
 * Named here are only things a person chose to say about themselves. Not their
 * birthday, not their contact details, nothing the church recorded ABOUT them
 * rather than something they wrote.
 *
 * Returns null rather than throwing when there is nobody: an Explorer waiting
 * to be paired is an ordinary state, not an error.
 */
export async function pairedProfile(id: string | null | undefined): Promise<Profile | null> {
  if (!id) return null;
  const { data, error } = await db()
    .from('profiles')
    .select('id, role, full_name, avatar, photo_path, topics_of_interest, city_of_residence, work_industry, preferred_language')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile) ?? null;
}

/**
 * A URL that will load for the next hour, or '' when there is no picture.
 * Called at render time rather than stored, for the reason above.
 */
export async function avatarUrl(path: string | null | undefined): Promise<string> {
  if (!path) return '';
  const { data } = await db().storage.from(AVATAR_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? '';
}

// ---------------------------------------------------------------------------
// Meetings, for the two people in a pairing.
// ---------------------------------------------------------------------------
//
// THE TABLE HAS BEEN IN THE LIVE DATABASE SINCE MIGRATION 0009 AND NOTHING EVER
// CALLED IT. The tutorial has had a booking card the whole time; the live app
// shipped with a private checklist instead, which is a different thing
// answering a different need. A Guide could remind themselves to call somebody
// and could not agree a time with them.
//
// Nothing new is needed in the database. The policies were already written for
// exactly this: both people in the pairing may read, create, edit and cancel,
// and nobody else can see any of it. `in_pairing` is what enforces that, so
// the Explorer is a full participant here rather than a spectator.

export type { MeetingMode };
export type MeetingStatus = 'proposed' | 'confirmed' | 'cancelled' | 'done';

export interface Meeting {
  id: string;
  pairing_id: string;
  title: string;
  starts_at: string;
  mode: MeetingMode;
  location: string | null;
  notes: string | null;
  status: MeetingStatus;
  created_by: string;
}

/** Everything arranged for this pairing, soonest first. */
export async function listMeetings(pairingId: string): Promise<Meeting[]> {
  const { data, error } = await db()
    .from('meetings')
    .select('id, pairing_id, title, starts_at, mode, location, notes, status, created_by')
    .eq('pairing_id', pairingId)
    .order('starts_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Meeting[];
}

/**
 * Propose a time. Either person may, which is the point: an Explorer who can
 * only ever be summoned is not walking alongside anybody.
 *
 * church_id is read from the caller's own profile rather than passed in, because
 * the insert policy checks it against my_church_id() and a value from the
 * browser would only ever be a way to get it wrong.
 */
export async function scheduleMeeting(
  pairingId: string,
  meeting: { title: string; startsAt: string; mode: MeetingMode; location?: string; notes?: string },
): Promise<void> {
  const me = await uid();
  const { data: profile } = await db()
    .from('profiles').select('church_id').eq('id', me).maybeSingle();
  const church = (profile as { church_id?: string } | null)?.church_id;
  if (!church) throw new Error('You are not in a church yet.');

  const { error } = await db().from('meetings').insert({
    pairing_id: pairingId,
    church_id: church,
    title: meeting.title.trim() || 'Study time',
    starts_at: meeting.startsAt,
    mode: meeting.mode,
    // KEPT FOR BOTH KINDS OF MEETING, which is what the column was always for:
    // 0009 documents it as "a place for in person, or a joining address for
    // online". This line said otherwise and threw the value away whenever the
    // meeting was online, so an online meeting could never carry the one thing
    // it needs — the link to join it. Somebody arranged a Zoom call and then
    // had to send the link separately, in a message, which is exactly the
    // errand arranging it on a shared card was meant to remove.
    //
    // An empty string is still not a place. Stored as null so the join button,
    // the map link and the "where" line can all simply test for absence.
    location: (meeting.location || '').trim() || null,
    notes: (meeting.notes || '').trim() || null,
    created_by: me,
  });
  if (error) throw new Error(error.message);
}

/**
 * Every meeting ahead of this caller, across all their pairings.
 *
 * ONE QUERY, NO PAIRING FILTER, and that is not laziness. The policy on
 * `meetings` is in_pairing(pairing_id), so an unfiltered read already returns
 * exactly the meetings this person is part of and nothing else. Adding a
 * client-side filter would protect nobody and would go wrong the first time
 * somebody forgot it.
 */
export async function myUpcomingMeetings(limit = 5): Promise<Meeting[]> {
  const { data, error } = await db()
    .from('meetings')
    .select('id, pairing_id, title, starts_at, mode, location, notes, status, created_by')
    .neq('status', 'cancelled')
    // An hour's grace, so something starting right now is still "ahead".
    .gte('starts_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Meeting[];
}

/** Confirm a proposed time. The other person agreeing is what makes it real. */
export async function confirmMeeting(id: string): Promise<void> {
  const { error } = await db().from('meetings').update({ status: 'confirmed' }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Cancel rather than delete. Somebody who arranged their afternoon around this
 * should see that it was called off, not find that it silently never existed.
 */
export async function cancelMeeting(id: string): Promise<void> {
  const { error } = await db().from('meetings').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Meetings across the church, as a leader may know them: when, online or in
 * person, and what state they are in. No title, no location, no notes.
 *
 * A separate function rather than a filtered read of `meetings`, because a
 * policy grants whole ROWS and a row carries the notes. "Leaders see that a
 * meeting is happening, not what was said in it" has to be true of the result
 * that crosses the wire, not of the screen that renders it.
 */
export interface ChurchMeeting {
  starts_at: string;
  mode: 'online' | 'in_person';
  status: 'proposed' | 'confirmed' | 'cancelled' | 'done';
}

export async function listChurchMeetings(): Promise<ChurchMeeting[]> {
  const { data, error } = await db().rpc('church_meeting_summary');
  if (error) throw new Error(error.message);
  return (data ?? []) as ChurchMeeting[];
}

// ---------------------------------------------------------------------------
// Recommendations, a Guide's private tools, and lesson series.
// ---------------------------------------------------------------------------

export interface Recommendation {
  id: string; church_id: string; dm_id: string;
  full_name: string; email: string; note: string | null;
  status: 'pending' | 'invited' | 'declined';
  decided_by: string | null; decided_at: string | null; created_at: string;
}

export async function listRecommendations(): Promise<Recommendation[]> {
  const { data, error } = await db().from('recommendations').select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Recommendation[];
}

/** A Guide puts a name forward. They cannot invite; a Director decides. */
export async function recommendSomeone(m: { full_name: string; email: string; note?: string }): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase.from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  const { error } = await supabase.from('recommendations').insert({
    church_id: me.church_id, dm_id: me_id,
    full_name: m.full_name.trim(), email: m.email.trim().toLowerCase(),
    note: m.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function decideRecommendation(id: string, status: 'invited' | 'declined'): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { error } = await supabase.from('recommendations')
    .update({ status, decided_by: me_id, decided_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export interface SeekerNote {
  id: string; pairing_id: string; author_id: string; body: string; created_at: string;
}

/** Private to the author. A leader cannot read these — see migration 0011. */
export async function listNotes(pairingId: string): Promise<SeekerNote[]> {
  const { data, error } = await db().from('seeker_notes').select('*')
    .eq('pairing_id', pairingId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SeekerNote[];
}

export async function addNote(pairingId: string, body: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { error } = await supabase.from('seeker_notes')
    .insert({ pairing_id: pairingId, author_id: me_id, body: body.trim() });
  if (error) throw new Error(error.message);
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await db().from('seeker_notes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface FollowUp {
  id: string; pairing_id: string; owner_id: string;
  title: string; due_on: string | null; done_at: string | null; created_at: string;
}

export async function listFollowUps(): Promise<FollowUp[]> {
  const { data, error } = await db().from('follow_ups').select('*')
    .order('due_on', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FollowUp[];
}

export async function addFollowUp(pairingId: string, title: string, dueOn?: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { error } = await supabase.from('follow_ups')
    .insert({ pairing_id: pairingId, owner_id: me_id, title: title.trim(), due_on: dueOn || null });
  if (error) throw new Error(error.message);
}

export async function toggleFollowUp(id: string, done: boolean): Promise<void> {
  const { error } = await db().from('follow_ups')
    .update({ done_at: done ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteFollowUp(id: string): Promise<void> {
  const { error } = await db().from('follow_ups').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export interface LessonSeries {
  id: string; church_id: string; title: string;
  description: string | null; topic: string; is_published: boolean; created_at: string;
  /** Who wrote it. Null on series made before Guides could write their own. */
  author_id: string | null;
}

/** One study inside a series. The body is the lesson; files hang off it. */
export interface Lesson {
  id: string; series_id: string | null; church_id: string; author_id: string;
  title: string; body: string; position: number; created_at: string;
}

export interface LessonFile {
  id: string; lesson_id: string; name: string; path: string;
  mime: string | null; size_bytes: number | null; added_by: string;
}

export interface LessonAssignment {
  id: string; pairing_id: string; series_id: string;
  assigned_by: string; completed_at: string | null; created_at: string;
}

export async function listLessonSeries(): Promise<LessonSeries[]> {
  const { data, error } = await db().from('lesson_series').select('*')
    .order('topic', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LessonSeries[];
}

export async function addLessonSeries(
  m: { title: string; topic: string; description?: string; publish?: boolean },
): Promise<string> {
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase.from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  const { data, error } = await supabase.from('lesson_series').insert({
    church_id: me.church_id, title: m.title.trim(),
    topic: m.topic.trim() || 'General', description: m.description?.trim() || null,
    // Stamped so a Guide owns what they wrote. The write policy checks it
    // against the caller, so this cannot be used to write as somebody else.
    author_id: me_id,
    is_published: m.publish ?? false,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** Publish or unpublish. Unpublished is visible to its author and Directors. */
export async function setSeriesPublished(id: string, published: boolean): Promise<void> {
  const { error } = await db().from('lesson_series').update({ is_published: published }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteLessonSeries(id: string): Promise<void> {
  const { error } = await db().from('lesson_series').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Lessons inside a series, and the handouts attached to them.
// ---------------------------------------------------------------------------

export async function listLessons(seriesId: string): Promise<Lesson[]> {
  const { data, error } = await db().from('lessons')
    .select('id, series_id, church_id, author_id, title, body, position, created_at')
    .eq('series_id', seriesId)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Lesson[];
}

export async function addLesson(
  seriesId: string, m: { title: string; body: string; position?: number },
): Promise<string> {
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase.from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  const { data, error } = await supabase.from('lessons').insert({
    series_id: seriesId, church_id: me.church_id, author_id: me_id,
    title: m.title.trim(), body: m.body.trim(), position: m.position ?? 0,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function deleteLesson(id: string): Promise<void> {
  const { error } = await db().from('lessons').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Every handout on these lessons, keyed by lesson id. */
export async function listLessonFiles(lessonIds: string[]): Promise<Record<string, LessonFile[]>> {
  if (lessonIds.length === 0) return {};
  const { data, error } = await db().from('lesson_files')
    .select('id, lesson_id, name, path, mime, size_bytes, added_by')
    .in('lesson_id', lessonIds)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const out: Record<string, LessonFile[]> = {};
  for (const row of (data ?? []) as LessonFile[]) (out[row.lesson_id] ??= []).push(row);
  return out;
}

export async function attachLessonFile(lessonId: string, file: File): Promise<void> {
  if (file.size > 10 * 1024 * 1024) throw new Error('That file is over 10 MB.');
  const supabase = db();
  const me_id = await uid();
  const { data: me } = await supabase.from('profiles').select('church_id').eq('id', me_id).maybeSingle();
  if (!me?.church_id) throw new Error('Your account is not in a church yet.');
  // The stored name is what a reader sees; the PATH never contains it, because
  // a filename is text somebody chose and a path is used to build URLs.
  const ext = (file.name.split('.').pop() || '').replace(/[^a-z0-9]/gi, '').slice(0, 6);
  const path = `lessons/${me_id}/${lessonId}-${Date.now()}${ext ? '.' + ext : ''}`;
  const up = await supabase.storage.from('pairing-media')
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (up.error) throw new Error(up.error.message);
  const { error } = await supabase.from('lesson_files').insert({
    lesson_id: lessonId, church_id: me.church_id, added_by: me_id,
    name: file.name.slice(0, 200), path, mime: file.type || null, size_bytes: file.size,
  });
  if (error) throw new Error(error.message);
}

export async function lessonFileUrl(path: string): Promise<string> {
  const { data } = await db().storage.from('pairing-media').createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? '';
}

export async function removeLessonFile(id: string): Promise<void> {
  const { error } = await db().from('lesson_files').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listAssignments(): Promise<LessonAssignment[]> {
  const { data, error } = await db().from('lesson_assignments').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as LessonAssignment[];
}

export async function assignSeries(pairingId: string, seriesId: string): Promise<void> {
  const supabase = db();
  const me_id = await uid();
  const { error } = await supabase.from('lesson_assignments')
    .insert({ pairing_id: pairingId, series_id: seriesId, assigned_by: me_id });
  if (error) throw new Error(error.code === '23505' ? 'Already assigned.' : error.message);
}

export async function completeAssignment(id: string, done: boolean): Promise<void> {
  const { error } = await db().from('lesson_assignments')
    .update({ completed_at: done ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Lessons and notifications.
// ---------------------------------------------------------------------------

// Lesson and addLesson used to be declared here as well, unused and
// church-wide. They are gone: the series-scoped pair above replaced them, and
// two functions with the same name doing nearly the same thing is how the
// wrong one gets called later.

export interface AppNotification {
  id: string; user_id: string; type: string;
  title: string; body: string; read_at: string | null; created_at: string;
}

/** Only ever this caller's own — enforced by policy, not by this query. */
export async function listNotifications(): Promise<AppNotification[]> {
  const { data, error } = await db().from('notifications').select('*')
    .order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await db().from('notifications')
    .update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await db().from('notifications')
    .update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Safeguarding
// ---------------------------------------------------------------------------

/** The five reasons offered. Kept in step with the database's CHECK constraint. */
export type ReportReason = 'inappropriate' | 'harassment' | 'unsafe' | 'spam' | 'other';

export interface LiveReport {
  id: string;
  reporter_id: string;
  subject_id: string;
  pairing_id: string | null;
  reason: ReportReason;
  detail: string | null;
  status: 'open' | 'actioned' | 'dismissed';
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  outcome: string | null;
}

/**
 * Raise a report about another member.
 *
 * Through a definer function rather than an insert, and the reason is worth
 * stating: the church is taken from the caller's own profile, not from an
 * argument. A browser that could name its own church_id could file a report
 * into a church it does not belong to. The function also refuses a subject
 * outside your church — which, done as an error rather than a silent success,
 * would otherwise be a way to discover that a stranger exists.
 *
 * The person reported is NOT notified. Every Director of the church is.
 */
export async function reportPerson(args: {
  subjectId: string;
  reason: ReportReason;
  detail?: string;
  pairingId?: string;
}): Promise<void> {
  const { error } = await db().rpc('report_person', {
    p_subject: args.subjectId,
    p_reason: args.reason,
    p_detail: args.detail ?? null,
    p_pairing: args.pairingId ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * The church's reports. Directors and Executive Directors only.
 *
 * There is no "my reports" view for the person who raised one, deliberately.
 * They are told it went through at the time; every extra read path is another
 * way for the wrong person to end up holding this.
 */
export async function listReports(): Promise<LiveReport[]> {
  const { data, error } = await db()
    .from('reports')
    .select('id, reporter_id, subject_id, pairing_id, reason, detail, status, created_at, decided_by, decided_at, outcome')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LiveReport[];
}

/**
 * Close a report.
 *
 * `dismissed` — a Director looked and judged there was nothing to answer — is
 * a real outcome and deliberately as easy to record as the other. Making the
 * innocent finding harder to file pushes Directors towards punishing somebody
 * to clear a queue.
 *
 * There is no delete. The table has no delete policy at all, so this is not a
 * convention that a future change could quietly drop.
 */
export async function resolveReport(
  id: string,
  status: 'actioned' | 'dismissed',
  outcome?: string,
): Promise<void> {
  const { data, error } = await db().rpc('resolve_report', {
    p_id: id,
    p_status: status,
    p_outcome: outcome ?? null,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error('That report could not be updated.');
}

// ---------------------------------------------------------------------------
// Files in a conversation
// ---------------------------------------------------------------------------
//
// The note further up this file said object storage was "a later, deliberate
// decision with a quota attached". This is that decision. The demo keeps
// attachments in the sender's own IndexedDB — a real privacy property, and
// also the reason the bytes never travel: the row syncs and the file does not.
// A Guide sending an Explorer a study sheet needs the file to arrive.
//
// Private bucket, 10 MB a file, a fixed list of types. Both the row and the
// object are guarded by membership of the pairing (migration 0022) — a row
// anyone could read leaks filenames, and an object anyone could fetch leaks
// the file, a storage path being guessable in a way a row id is not.

export interface PairingFile {
  id: string;
  pairing_id: string;
  owner_id: string;
  title: string;
  mime: string;
  size: number;
  path: string;
  created_at: string;
}

const MEDIA_BUCKET = 'pairing-media';
/** Kept in step with the bucket's own file_size_limit in migration 0022. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export async function listPairingFiles(pairingId: string): Promise<PairingFile[]> {
  const { data, error } = await db()
    .from('pairing_media')
    .select('id, pairing_id, owner_id, title, mime, size, path, created_at')
    .eq('pairing_id', pairingId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PairingFile[];
}

/**
 * Send a file.
 *
 * THE UPLOAD HAPPENS FIRST AND THE ROW SECOND, and if the row fails the object
 * is removed again. The other order leaves a row pointing at nothing, which
 * renders as a broken attachment for ever — worse than a failure the sender
 * can see and retry.
 *
 * The path is `<pairing_id>/<uuid>` and never the person's filename. Filenames
 * carry spaces, accents and occasionally somebody's full name; the title is
 * kept in the row, where it belongs.
 */
export async function sendPairingFile(pairingId: string, file: File): Promise<PairingFile> {
  const client = db();
  // uid() reads the session this app verified server-side and stored itself.
  // Asking Supabase Auth again would be a second round trip for something
  // already known, and tests/security-invariants.mjs forbids it by name — it
  // caught this exact line on the first attempt.
  const me = await uid();

  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `That file is ${Math.round(file.size / 1024 / 1024)} MB. The limit is 10 MB. `
      + 'try a photo rather than a video, or share a link instead.',
    );
  }

  // uuid(), not crypto.randomUUID(). The latter is a SECURE-CONTEXT api: it is
  // undefined over plain http on a LAN address, and absent in Safari before
  // 15.4. Unguarded it throws rather than degrading, so sending a photo failed
  // outright with nothing the person could act on. lib/uuid.ts exists for this
  // and lib/localMedia.ts already used it; this one call site did not, which is
  // exactly the shape of bug a helper is supposed to prevent.
  const path = `${pairingId}/${uuid()}`;
  const { error: upErr } = await client.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await client
    .from('pairing_media')
    .insert({
      pairing_id: pairingId,
      owner_id: me,
      title: file.name || 'Attachment',
      mime: file.type || '',
      size: file.size,
      path,
    })
    .select('id, pairing_id, owner_id, title, mime, size, path, created_at')
    .single();

  if (error) {
    // Do not leave bytes nobody can reach.
    await client.storage.from(MEDIA_BUCKET).remove([path]).catch(() => {});
    throw new Error(error.message);
  }
  return data as PairingFile;
}

/**
 * A URL the browser can actually open.
 *
 * Signed and short-lived, because the bucket is private. One hour: long enough
 * to read a PDF on a slow connection, short enough that a URL pasted into a
 * group chat stops working.
 */
export async function pairingFileUrl(path: string): Promise<string> {
  const { data, error } = await db().storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Take back something you sent. Only the sender; see migration 0022. */
export async function removePairingFile(file: PairingFile): Promise<void> {
  const client = db();
  const { error } = await client.from('pairing_media').delete().eq('id', file.id);
  if (error) throw new Error(error.message);
  // The row is what the screen reads, so its removal is what matters and is
  // done first. An orphaned object is invisible and costs a few kilobytes; an
  // orphaned row is a broken attachment on somebody's screen.
  await client.storage.from(MEDIA_BUCKET).remove([file.path]).catch(() => {});
}

// ---------------------------------------------------------------------------
// The trial room: suspending a member, and removing one
// ---------------------------------------------------------------------------
//
// A church running this has no other lever. If somebody sends an Explorer
// something they should not have, the leadership must be able to act tonight,
// from a phone, without a developer. Reports gave them the evidence; this is
// the response.
//
// JAIL and KICK are different acts and are kept different:
//
//   suspendMember   the account is switched OFF. They stay in the church and
//                   keep their history, and cannot sign in at all -- migration
//                   0026 bans the auth account and deletes their live sessions,
//                   so somebody already signed in is out at once rather than at
//                   token expiry. Reversible: restoreMember switches it back on.
//                   This is both "we are looking into it" and "you are out
//                   until we talk".
//   removeMember    they are gone.
//
// WHO MAY DO WHAT IS DECIDED IN THE DATABASE (migration 0023), never here. An
// Executive Director may act on anyone in a church they oversee; a Director on
// Guides and Explorers only; nobody on themselves; and nobody at all on the
// Head Executive Director, who is the root of authority and the one account
// that can appoint executives again afterwards (migration 0025). Each call
// returns 'ok' or the reason it was refused, because a leader trying to stop
// something deserves a sentence, not a button that does nothing.

/** Suspend ("jail"). Returns 'ok', or the reason it was refused. */
export async function suspendMember(userId: string, reason?: string): Promise<string> {
  const { data, error } = await db().rpc('suspend_member', {
    p_target: userId,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/** Lift a suspension ("unjail"). Pairings are NOT restored — see 0023. */
export async function restoreMember(userId: string): Promise<string> {
  const { data, error } = await db().rpc('restore_member', { p_target: userId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/** Remove from the church entirely ("kick"), under the same authority rules. */
export async function removeMemberByLeader(userId: string): Promise<string> {
  const { data, error } = await db().rpc('remove_member_by_leader', { p_target: userId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/**
 * Who this caller may act on, and how it would be refused if not.
 *
 * Asked per person so the screen can hide what would fail rather than offering
 * a Director a button that refuses. The database still decides; this only
 * spares somebody the experience of being told no.
 */
export async function disciplineCheck(userId: string): Promise<string> {
  const { data, error } = await db().rpc('discipline_check', { p_target: userId });
  if (error) return 'unavailable';
  return String(data ?? 'unavailable');
}

// ---------------------------------------------------------------------------
// The trial room, as a court
// ---------------------------------------------------------------------------
//
// Reports say what one person believes happened. A trial is where both sides
// say it in their own words, in one place, before anybody is suspended or
// removed -- and where what was said survives the decision.
//
// THE JUDGE RULE, because it is the one that surprises people: the Director who
// opens a case is head judge from the first moment. Calling for an Executive
// Director does not vacate the seat; it only offers it. If no Executive ever
// answers, the Director decides the case. There is no countdown anywhere.

export interface Trial {
  id: string;
  summary: string;
  subject_id: string;
  subject_name: string;
  opened_by: string;
  opener_name: string;
  head_judge_id: string;
  judge_name: string;
  escalation: 'none' | 'requested' | 'accepted';
  status: 'open' | 'closed';
  verdict: 'dismissed' | 'suspended' | 'removed' | null;
  verdict_note: string | null;
  opened_at: string;
  closed_at: string | null;
  my_part: 'accused' | 'reporter' | 'witness' | null;
  am_judge: boolean;
}

export interface TrialStatement {
  id: string;
  trial_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

/** Every case this person is party to or, as a leader, responsible for. */
export async function listTrials(): Promise<Trial[]> {
  const { data, error } = await db().rpc('my_trials');
  if (error) throw new Error(error.message);
  return (data ?? []) as Trial[];
}

/**
 * Open a case against someone, and summon the other side with them.
 *
 * `otherId` names the other party directly; `reportId` takes them from the
 * report that prompted it. Either way both sides end up able to read the case
 * and answer it, which is the entire point of holding one.
 */
export async function openTrial(args: {
  subjectId: string;
  summary: string;
  reportId?: string;
  otherId?: string;
}): Promise<string> {
  const { data, error } = await db().rpc('open_trial', {
    p_subject: args.subjectId,
    p_summary: args.summary,
    p_report: args.reportId ?? null,
    p_other: args.otherId ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Ask an Executive Director to take the seat. The Director keeps it until one does. */
export async function callHeadJudge(trialId: string): Promise<string> {
  const { data, error } = await db().rpc('call_head_judge', { p_trial: trialId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/** An Executive Director answers the call. */
export async function takeHeadJudge(trialId: string): Promise<string> {
  const { data, error } = await db().rpc('take_head_judge', { p_trial: trialId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/**
 * Decide the case. Only the head judge, and the verdict is carried out by the
 * same functions the member list uses, so a court cannot reach past the
 * authority its judge already has.
 */
export async function closeTrial(
  trialId: string,
  verdict: 'dismissed' | 'suspended' | 'removed',
  note?: string,
): Promise<string> {
  const { data, error } = await db().rpc('close_trial', {
    p_trial: trialId,
    p_verdict: verdict,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

/** What has been said in a case, oldest first. */
export async function listStatements(trialId: string): Promise<TrialStatement[]> {
  const { data, error } = await db()
    .from('trial_statements')
    .select('*')
    .eq('trial_id', trialId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TrialStatement[];
}

/**
 * Say something in a case.
 *
 * A SUSPENDED PERSON MAY STILL DO THIS. Suspension stops them messaging, and
 * if it also silenced them here then suspending somebody pending a hearing
 * would take away their defence -- so every trial after a precautionary
 * suspension would be one-sided by construction. The policy in 0024
 * deliberately does not consult suspended_at.
 */
export async function speakInTrial(trialId: string, body: string): Promise<void> {
  const me = await uid();
  const { error } = await db()
    .from('trial_statements')
    .insert({ trial_id: trialId, author_id: me, body });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Guilds
// ---------------------------------------------------------------------------
//
// A pairing is one Guide and one Explorer. A guild is the group a Director
// wants to name -- a campus, a cohort, a Sabbath team -- and naming it is the
// part that matters to the people in it.
//
// An Explorer is never handed the roll. They can see the guild they are in and
// how many are in it; the names come back as an empty list for them, because a
// group feature that quietly published a roster of everybody being discipled
// at this church would undo the privacy the one-to-one conversations exist for.

export interface GuildMember {
  id: string;
  name: string;
  role: Role;
}

export interface Guild {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  guides: number;
  explorers: number;
  members: GuildMember[];
  i_am_in_it: boolean;
}

export async function listGuilds(): Promise<Guild[]> {
  const { data, error } = await db().rpc('list_guilds');
  if (error) throw new Error(error.message);
  return (data ?? []) as Guild[];
}

export async function createGuild(name: string, description?: string): Promise<string> {
  const { data, error } = await db().rpc('create_guild', {
    p_name: name,
    p_description: description ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function renameGuild(guildId: string, name: string): Promise<string> {
  const { data, error } = await db().rpc('rename_guild', { p_guild: guildId, p_name: name });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

export async function deleteGuild(guildId: string): Promise<string> {
  const { data, error } = await db().rpc('delete_guild', { p_guild: guildId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

export async function addToGuild(guildId: string, personId: string): Promise<string> {
  const { data, error } = await db().rpc('add_to_guild', { p_guild: guildId, p_person: personId });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

export async function removeFromGuild(guildId: string, personId: string): Promise<string> {
  const { data, error } = await db().rpc('remove_from_guild', {
    p_guild: guildId,
    p_person: personId,
  });
  if (error) throw new Error(error.message);
  return String(data ?? 'Something went wrong.');
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
//
// Every word in `health` is defined in guild_metrics() (migration 0029), not
// here and not in the component, so the badge and the rule that produced it
// cannot drift apart.

export interface GuildMetric {
  id: string;
  name: string;
  members: number;
  guides: number;
  explorers: number;
  unpaired_explorers: number;
  suspended: number;
  removed_ever: number;
  messages_30d: number;
  last_activity_at: string | null;
  state: 'empty' | 'active' | 'quiet' | 'stagnant';
  health: 'thriving' | 'steady' | 'watch' | 'stagnant';
}

export interface ChurchPulse {
  church_id: string;
  church_name: string;
  directors: number;
  guides: number;
  explorers: number;
  awaiting_approval: number;
  active_pairings: number;
  unpaired_explorers: number;
  guilds_total: number;
  guilds_active: number;
  guilds_stagnant: number;
  suspended_now: number;
  removed_ever: number;
  open_reports: number;
  open_trials: number;
  messages_7d: number;
  messages_30d: number;
}

/**
 * One entry in the church's record of who was let in, switched off or removed.
 *
 * `approved` and `disapproved` joined the older three in migration 0041. Before
 * that a disapproval left no trace at all, so "how many did we turn away this
 * quarter" had no answer — the profile simply carried a false flag and nothing
 * said when, or who by. Approvals are recorded alongside the refusals on
 * purpose: a log that keeps only the punishments reads like a charge sheet
 * rather than a record of decisions.
 */
export interface DisciplineEntry {
  id: string;
  person_name: string;
  person_role: string;
  action: 'suspended' | 'released' | 'removed' | 'approved' | 'disapproved';
  reason: string | null;
  by_name: string;
  guild_names: string[];
  at: string;
}

export async function guildMetrics(): Promise<GuildMetric[]> {
  const { data, error } = await db().rpc('guild_metrics');
  if (error) throw new Error(error.message);
  return (data ?? []) as GuildMetric[];
}

/** One row per church this leader is responsible for. */
export async function churchPulse(): Promise<ChurchPulse[]> {
  const { data, error } = await db().rpc('church_pulse');
  if (error) throw new Error(error.message);
  return (data ?? []) as ChurchPulse[];
}

/**
 * Every member under 18, for the Director who is responsible for them.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE BADGE. The badge (components/MinorBadge)
 * marks a minor wherever somebody already happens to be looking at them, which
 * is right when you are looking and useless for the question a Director has to
 * answer: who are all of them, and is anybody missing a consent letter? A
 * safeguard you can only see by visiting every profile in turn is a safeguard
 * nobody performs.
 *
 * The guardian comes back as a real account when the guardian is also a member,
 * which is most often a Guide. It is NEVER inferred from a shared surname: a
 * Director records the link once from the signed letter in front of them, and
 * a wrong guess here links a child to a stranger.
 *
 * Rows with no consent recorded sort first, because those are the ones that
 * need doing.
 */
export interface MinorRow {
  member_id: string;
  full_name: string;
  role: Role;
  birthday: string | null;
  consent_recorded: boolean;
  guardian_name: string | null;
  guardian_member_id: string | null;
  guardian_full_name: string | null;
  guardian_role: Role | null;
  guardian_is_member: boolean;
}

export async function minorsInChurch(churchId?: string): Promise<MinorRow[]> {
  const { data, error } = await db().rpc('minors_in_church', {
    p_church: churchId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MinorRow[];
}

/** A Director records the signed letter, and who signed it. */
export async function recordGuardianConsent(
  memberId: string,
  guardianName: string,
  guardianMemberId?: string,
): Promise<void> {
  const { error } = await db().rpc('record_guardian_consent', {
    p_member: memberId,
    p_guardian_name: guardianName,
    p_guardian_member: guardianMemberId ?? null,
  });
  if (error) throw new Error(error.message);
}

/** A parent can change their mind, so this has to exist. */
export async function withdrawGuardianConsent(memberId: string): Promise<void> {
  const { error } = await db().rpc('withdraw_guardian_consent', { p_member: memberId });
  if (error) throw new Error(error.message);
}

/**
 * The discipline record, which outlives the people in it.
 *
 * Names and roles are copied onto the log at the time of the act (migration
 * 0028), because removing somebody deletes their profile — and the first
 * version of this lost the record of the removal along with the person.
 */
export async function disciplineHistory(): Promise<DisciplineEntry[]> {
  const { data, error } = await db().rpc('discipline_history');
  if (error) throw new Error(error.message);
  return (data ?? []) as DisciplineEntry[];
}
