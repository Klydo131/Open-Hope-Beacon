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
// WHAT IT COSTS, said plainly. The message uses the project's own Auth email
// template rather than the church's words, and the built-in service is rate
// limited — a handful of messages an hour, one per address per minute. That is
// right for a church inviting people a few at a time and wrong for a bulk
// send. A church that outgrows it adds a provider: see docs/EMAIL.md.

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

  // AN OPEN INVITATION MEANS RESEND, NOT REFUSE. Returning early on 23505
  // created nothing, sent nothing and reported success — so once somebody's
  // first invitation had failed, their address was permanently un-invitable.
  let inviteId = invite?.id;
  let resent = false;

  if (inviteErr) {
    if (inviteErr.code !== '23505') return json({ error: inviteErr.message }, 400);

    const { data: open } = await admin
      .from('invites')
      .select('id, church_id')
      .eq('email', email)
      .is('redeemed_at', null)
      .maybeSingle();

    // Only a Director of the SAME church may resend, or the index becomes a way
    // to discover which addresses another church has invited.
    if (!open || open.church_id !== church) {
      return json({ ok: true, already: true, message: 'That person already has an open invitation.' });
    }
    inviteId = open.id;
    resent = true;
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

  // A COOLDOWN IS NOT A FAILURE. The service allows one message per address per
  // minute, and pressing Send twice in quick succession — which is what anybody
  // does when unsure the first press worked — hits it. Reported as a fault, a
  // sixty-second timer reads as the whole email system being broken again.
  if (sendError) {
    const cooldown = /after (\d+) seconds/i.exec(sendError);
    if (cooldown) {
      waitSeconds = Number(cooldown[1]);
      sendError =
        'Nearly — one message per address per minute, and one has just gone out. '
        + `Wait ${cooldown[1]} seconds and press Send once. The link below works meanwhile.`;
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
