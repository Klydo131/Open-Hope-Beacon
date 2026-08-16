// Send an invitation.
//
// WHY THIS RUNS ON A SERVER AND NOT IN THE BROWSER. Sending an invitation means
// creating an auth user, and that needs the service_role key — the one key that
// bypasses every row level security policy in the database. It can never touch
// a browser. This function holds it, and this function is the only thing that
// does.
//
// PROVIDER-AGNOSTIC ON PURPOSE. Nothing here names Resend, Brevo, Postmark or
// anybody else. The mail goes out through whatever SMTP is configured in
// Supabase (Project Settings -> Authentication -> SMTP). That means switching
// provider is a dashboard change, not a deploy — which matters, because the
// first provider you try is rarely the one you keep, and coupling an app to a
// mail vendor is how you end up unable to leave one.
//
// WHAT IT WILL NOT DO:
//   - trust the caller's claim about who they are. The JWT is verified against
//     the database, and the caller's own church is read from their profile
//     rather than accepted from the request body. A Director cannot invite into
//     somebody else's church by editing a field.
//   - let a Guide invite. They recommend; a Director decides. That line is
//     enforced here as well as in the table's policies.
//   - reveal whether an address already has an account. Same response either
//     way, because the difference is a way to enumerate a church's members.

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

  // Who is asking. The token comes from the caller; everything about them is
  // then read from the database, never from the request.
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
  // An invitation cannot mint an Executive Director. That role is appointed in
  // the database by somebody who already holds it, deliberately — it is the one
  // role that reaches across churches.
  if (!['admin', 'dm', 'ds'].includes(role)) return json({ error: 'Unknown role.' }, 400);
  if (role === 'admin' && me.role !== 'executive') {
    return json({ error: 'Only an Executive Director may invite a Director.' }, 403);
  }

  // The church is the CALLER'S, read from their profile. Not from the body.
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

  if (inviteErr) {
    // 23505 is the one-open-invite-per-address index doing its job.
    if (inviteErr.code === '23505') {
      return json({ ok: true, already: true, message: 'That person already has an open invitation.' });
    }
    return json({ error: inviteErr.message }, 400);
  }

  // Send it. Supabase creates the auth user and mails the link through whatever
  // SMTP the project is configured with.
  // SITE_URL is the stable production choice. Origin keeps a fresh fork and
  // localhost usable before that secret is set; Supabase still enforces its
  // own redirect allow-list before including the URL in mail.
  const site = safeOrigin(Deno.env.get('SITE_URL')) || safeOrigin(req.headers.get('Origin'));
  const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: site ? `${site}/join` : undefined,
  });

  if (mailErr) {
    // Roll the invite back rather than leaving a row that says somebody was
    // invited when no mail ever left the building. A Director who sees "sent"
    // and hears nothing has no way to tell which half failed.
    await admin.from('invites').delete().eq('id', invite.id);

    // The real reason goes to the Director, because "non-2xx status code" is
    // what this used to say and it told nobody anything. It is safe here: only
    // an approved Director reaches this line.
    return json({ error: `The invitation was not sent: ${mailErr.message}` }, 502);
  }

  return json({ ok: true, invite_id: invite.id });
});
