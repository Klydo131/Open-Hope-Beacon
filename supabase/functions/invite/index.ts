// Send an invitation.
//
// Holds the service_role key — the one key that bypasses every row level
// security policy — so it can never run in a browser.
//
// THE EMAIL GOES THROUGH SUPABASE ITSELF, and that is the whole design now.
// An earlier version posted the message to an external provider (Brevo) and
// treated Supabase's own mailer as a fallback. That cost a day: the key, the
// sender and the site URL were all correct and loaded, and every single call
// was refused anyway because the provider's IP allow-list was switched on and
// Edge Functions have no fixed address to add to it. Invitations stopped
// because of a setting in a third party's dashboard that nobody could see from
// inside this app.
//
// Supabase's mailer cannot fail that way. It is sent by Supabase, from inside
// Supabase, with no third-party account, no API key to store, no sender address
// to verify and no allow-list to fall foul of. A fresh clone of this project
// sends working invitations with nothing configured at all.
//
// WHAT IT COSTS, said plainly, and the number is measured rather than guessed.
// TWO MESSAGES AN HOUR, for the whole project — the auth log for this church
// shows at most two successes in any hour and `over_email_send_rate_limit` on
// everything after, including invitations the Director believed had gone. There
// is also a separate one-per-address-per-minute limit. The template is the
// project's own Auth template rather than the church's words.
//
// That is enough for a church adding people one at a time and nowhere near
// enough for a launch weekend, and it CANNOT be raised while the built-in
// mailer is in use. A church inviting more than two people an hour has to
// connect an email provider: see docs/EMAIL.md. Until it does, every response
// from this function carries a join link the Director can send by hand, which
// is the reason that link exists.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/**
 * Read one setting: the environment first, then public.app_settings.
 *
 * app_settings has RLS on with no policies and every grant revoked from PUBLIC,
 * so the service role this function holds is the only thing that can read it.
 */
async function setting(admin: SupabaseClient, name: string): Promise<string> {
  const fromEnv = (Deno.env.get(name) || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const { data } = await admin
      .from('app_settings').select('value').eq('key', name).maybeSingle();
    return String(data?.value ?? '').trim();
  } catch {
    return '';
  }
}

const safeOrigin = (value: string | null) => {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : '';
  } catch {
    return '';
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Function is not configured.' }, 500);

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in first.' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: caller, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !caller.user) return json({ error: 'Sign in first.' }, 401);

  const { data: me } = await admin
    .from('profiles')
    .select('id, role, church_id, is_approved')
    .eq('id', caller.user.id)
    .maybeSingle();

  if (!me || !me.is_approved) return json({ error: 'Your account is not approved yet.' }, 403);
  if (me.role !== 'admin' && me.role !== 'executive') {
    return json({ error: 'Only a Director may send an invitation.' }, 403);
  }
  if (!me.church_id) return json({ error: 'Your account is not in a church yet.' }, 400);

  let body: { email?: string; role?: string; full_name?: string; recommended_by?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const role = body.role ?? 'ds';
  const fullName = (body.full_name ?? '').trim();

  if (!email || !email.includes('@')) return json({ error: 'That is not an email address.' }, 400);
  if (!['admin', 'dm', 'ds'].includes(role)) return json({ error: 'Unknown role.' }, 400);
  if (role === 'admin' && me.role !== 'executive') {
    return json({ error: 'Only an Executive Director may invite a Director.' }, 403);
  }

  const church = me.church_id;

  let recommendedBy: string | null = null;
  if (body.recommended_by) {
    if (role !== 'ds') {
      return json({ error: 'Only an Explorer invitation may name a Guide.' }, 400);
    }
    const { data: guide } = await admin
      .from('profiles')
      .select('id')
      .eq('id', body.recommended_by)
      .eq('church_id', church)
      .eq('role', 'dm')
      .eq('is_approved', true)
      .maybeSingle();
    if (!guide) return json({ error: 'Choose an approved Guide from this church.' }, 400);
    recommendedBy = guide.id;
  }

  // ALREADY IN THIS CHURCH? THEN THERE IS NOTHING TO INVITE THEM TO.
  //
  // Nothing checked this, so inviting somebody who was already a member created
  // a perfectly valid invitation for them. The Executive Director's own address
  // ended up with an open invitation as a Guide sitting in the Invitations
  // list — their account was untouched and still executive, but the screen
  // said otherwise, and there was no way to tell which was true.
  //
  // The role-change worry that first justified this check turned out not to be
  // real, and the note is kept rather than deleted because it explains why the
  // check is allowed to be lenient below: handle_new_user fires only on INSERT
  // into auth.users, so an invitation aimed at an address that already has an
  // account can never re-apply a role to it. Checked against the deployed
  // trigger body, not assumed.
  //
  // Addresses live in auth.users, which only the service role can read — which
  // is why this check belongs in this function and could not have been a policy.
  {
    // member_by_email is SECURITY DEFINER and granted to service_role ONLY.
    // It answers "is this address registered?", which is an enumeration oracle
    // in any browser's hands, so it is never exposed to one.
    const { data: found } = await admin.rpc('member_by_email', { p_email: email });
    const existing = Array.isArray(found) ? found[0] : found;

    // AN ACCOUNT IS NOT THE SAME AS HAVING JOINED, and refusing on the first
    // blocks exactly the person who most needs re-inviting.
    //
    // Every invitation creates the auth account up front, so an address whose
    // first invitation never arrived HAS an account and cannot sign in with it.
    // Refusing that as "already a member" strands them for good: the check
    // blocks the new invitation, and they have no password. Having opened a
    // link is no better a test — the Director opens it themselves to see that
    // it works. completed_at is stamped by the sign-up form, once, after a
    // password has been chosen, which is the first step that needs the invited
    // person to be there.
    if (existing && existing.completed_at) {
      const ROLE_NAME: Record<string, string> = {
        executive: 'an Executive Director',
        admin: 'a Director',
        dm: 'a Guide',
        ds: 'an Explorer',
      };
      const who = ROLE_NAME[String(existing.role)] ?? 'a member';
      if (existing.church_id === church) {
        return json({
          error:
            `${email} is already ${who} in this church`
            + `${existing.full_name ? ` (${existing.full_name})` : ''}. `
            + 'To change what they can do, use their entry in the member list rather than a new invitation.',
        }, 409);
      }
      // A different church's member. Say nothing about which, or the refusal
      // becomes a way to discover where an address is already registered.
      return json({ error: `${email} already has a Hope Beacon account.` }, 409);
    }
  }

  // ONE INVITATION PER ADDRESS, REFRESHED — NOT A SECOND ROW, NOT A REFUSAL.
  //
  // This was an insert that leaned on a unique index to detect a repeat, and
  // both halves were broken by the same misunderstanding of redeemed_at.
  //
  //   * The index is `unique (church_id, lower(email)) where redeemed_at is
  //     null`, and redeemed_at is stamped when the account row is created,
  //     which is the moment the first invitation is SENT. So the index stopped
  //     applying immediately and a second invitation to the same person quietly
  //     inserted a SECOND ROW.
  //   * The recovery path underneath it looked up the existing invitation with
  //     the same `redeemed_at is null` filter, found nothing for the same
  //     reason, and returned "that person already has an open invitation"
  //     without sending anything at all. Pressing Re-send did nothing and
  //     reported success.
  //
  // Looking the invitation up first is both simpler and correct: if there is
  // one, refresh it and send again; if there is not, make one. The Director
  // pressing Re-send now always causes a message, which is the entire point of
  // the button. Migration 0020 makes the index unconditional so a duplicate
  // cannot appear even if this logic is changed again.
  const { data: priorRows } = await admin
    .from('invites')
    .select('id')
    .eq('church_id', church)
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1);
  const prior = priorRows?.[0];

  let inviteId = prior?.id as string | undefined;
  const resent = Boolean(prior);

  if (prior) {
    // The role and the name may have been corrected since. Push the expiry out
    // as well, or a Re-send would hand over a link that is already dead.
    await admin
      .from('invites')
      .update({
        role,
        full_name: fullName || null,
        invited_by: me.id,
        recommended_by: recommendedBy,
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', prior.id);
  } else {
    const { data: invite, error: inviteErr } = await admin
      .from('invites')
      .insert({
        church_id: church,
        email,
        role,
        full_name: fullName || null,
        invited_by: me.id,
        recommended_by: recommendedBy,
      })
      .select('id')
      .single();
    if (inviteErr) return json({ error: inviteErr.message }, 400);
    inviteId = invite.id;
  }

  const site = safeOrigin(await setting(admin, 'SITE_URL')) || safeOrigin(req.headers.get('Origin'));
  if (!site) {
    if (!resent) await admin.from('invites').delete().eq('id', inviteId);
    return json({ error: 'Cannot work out this app’s address. Set SITE_URL.' }, 400);
  }

  // SEND IT. Two shapes, because the person either has an account or does not.
  //
  //   inviteUserByEmail      creates the account AND sends "you have been invited"
  //   resetPasswordForEmail  sends "set a password" to an account that exists
  //
  // A resend almost always lands on the second: the first invitation created
  // the account, so inviting again is refused as already registered. Both mails
  // land on /join, which is the screen that finishes the sign-up either way.
  let via = '';
  let sendError = '';
  let waitSeconds = 0;

  const { error: inviteMailErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${site}/join`,
  });

  if (!inviteMailErr) {
    via = 'invite';
  } else if (/already|registered|exists/i.test(String(inviteMailErr.message ?? ''))) {
    const { error: resetErr } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: `${site}/join?recovery=1`,
    });
    if (!resetErr) via = 'recovery';
    else sendError = String(resetErr.message ?? '');
  } else {
    sendError = String(inviteMailErr.message ?? '');
  }

  // TWO DIFFERENT REFUSALS WEAR THE SAME 429, and telling them apart is the
  // difference between "wait a minute" and "you are out of email for the hour".
  //
  //   "after N seconds"            one message per ADDRESS per minute.
  //   "email rate limit exceeded"  the whole PROJECT's hourly quota is spent.
  //
  // The second one is the wall this church kept hitting. Supabase's built-in
  // mailer allows two messages an hour for the entire project — measured, not
  // guessed: the auth log shows at most two successes in any hour and a 429 on
  // everything after. So a Director inviting a third person gets a refusal that
  // has nothing to do with the address they typed, and the old message showed
  // them the raw provider text and left them to work that out.
  if (sendError) {
    const cooldown = /after (\d+) seconds/i.exec(sendError);
    if (cooldown) {
      waitSeconds = Number(cooldown[1]);
      sendError =
        'Nearly — one message per address per minute, and one has just gone out. '
        + `Wait ${cooldown[1]} seconds and press Send once. The link below works meanwhile.`;
    } else if (/email rate limit|over_email_send_rate/i.test(sendError)) {
      sendError =
        'This project has used up its email for the hour. Supabase\u2019s built-in '
        + 'mailer sends two messages an hour, for the whole church, and both have '
        + 'gone. Nothing is broken and nothing was lost — send the link below to '
        + 'this person now, and the next hour starts fresh. To invite more people '
        + 'at once, connect an email provider: see docs/EMAIL.md.';
    }
  }

  // A LINK TO PASS ON BY HAND, ALWAYS — not only when the send failed.
  //
  // The emailed link is built by Supabase from the project's Site URL, and if
  // the app's address is not in the Redirect URLs allow-list that setting is
  // silently ignored and the mail carries whatever Site URL says. A project
  // still on its default sent every invited person a link to
  // http://localhost:3000, which is a machine they do not have. The email
  // "succeeded" and was useless, and the Director had no way to tell.
  //
  // This link is built HERE, from SITE_URL, so it is right whatever the
  // dashboard says. Handing it over every time costs one extra token and means
  // a church is never stuck behind a setting only its Supabase owner can reach.
  let joinUrl = '';
  {
    let { data: link } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { data: { full_name: fullName }, redirectTo: `${site}/join` },
    });
    let kind = 'invite';
    if (!link?.properties?.hashed_token) {
      ({ data: link } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${site}/join` },
      }));
      kind = 'recovery';
    }
    const hashed = link?.properties?.hashed_token ?? '';
    // `email_otp` passed as `?code=` selects the PKCE route, which needs a
    // verifier the browser wrote when it STARTED the flow. A server minted this,
    // so that route failed for everyone. `hashed_token` needs no prior state.
    if (hashed) joinUrl = `${site}/join?token_hash=${encodeURIComponent(hashed)}&type=${kind}`;
  }

  console.log(JSON.stringify({
    at: 'invite',
    delivery: sendError ? 'link' : 'email',
    via,
    resent,
    reason: sendError,
    wait_seconds: waitSeconds,
    have_site_url: Boolean(site),
  }));

  if (sendError) {
    // The account and the link are real even though the mail did not go, so the
    // invitation row STAYS and the Director is handed the link. Deleting it here
    // would throw away a working invitation over a bad minute.
    return json({
      ok: true,
      invite_id: inviteId,
      delivery: 'link',
      resent,
      link: joinUrl,
      mailNote: sendError,
      waitSeconds: waitSeconds || undefined,
    });
  }

  return json({
    ok: true,
    invite_id: inviteId,
    delivery: 'email',
    via,
    resent,
    // The Director gets it as well as the recipient. If the emailed link is
    // wrong because Site URL is unset, this one still works.
    link: joinUrl,
  });
});
