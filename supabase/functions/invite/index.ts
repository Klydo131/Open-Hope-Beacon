// Send an invitation.
//
// WHY THIS RUNS ON A SERVER AND NOT IN THE BROWSER. Sending an invitation means
// creating an auth user, and that needs the service_role key — the one key that
// bypasses every row level security policy in the database. It can never touch
// a browser. This function holds it, and this function is the only thing that
// does.
//
// THE INVITATION IS FROM THE CHURCH, NOT FROM A DATABASE VENDOR. This function
// mints the one-time link itself and posts the message itself, rather than
// handing both to the auth provider's built-in mailer. That change fixed two
// things a church cannot live with: the link in the mail pointed at
// localhost:3000, because it came from a dashboard field nobody had set, and
// the message was signed 'Supabase Auth', which is not who invited anybody.
//
// The provider lives in ONE function at the bottom of this file. Moving to
// Postmark, SES or your own relay is an edit there and nowhere else.
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

  // The church's own name, for the invitation. A message saying "a church has
  // invited you" that cannot say which one reads like something to delete.
  let churchName = 'Your church';
  {
    const { data: ch } = await admin
      .from('churches').select('name').eq('id', church).maybeSingle();
    if (ch?.name) churchName = ch.name;
  }

  // Mint the link OURSELVES, and send the mail OURSELVES.
  //
  // WHY NOT inviteUserByEmail. It hands the whole thing to Supabase Auth, and
  // that produced two failures a church cannot live with:
  //
  //   1. THE LINK POINTED AT localhost:3000. The address in the mail comes from
  //      the project's configured Site URL, not from this function, so an
  //      unconfigured project mails everybody a link to their own machine.
  //      The recipient sees "This site can't be reached" and concludes the
  //      church sent them something broken.
  //   2. THE MAIL SAID "Supabase Auth". A person is being invited by their
  //      CHURCH. An invitation signed by the database vendor reads like
  //      something to delete, and no amount of correct engineering survives
  //      that first impression.
  //
  // generateLink does everything inviteUserByEmail does EXCEPT send: the
  // account is created and a one-time code is minted. So we build the address
  // from what WE know, write the words ourselves, and post it through Brevo.
  // Nothing depends on a dashboard setting anybody has to remember.
  const site = safeOrigin(Deno.env.get('SITE_URL')) || safeOrigin(req.headers.get('Origin'));
  if (!site) {
    await admin.from('invites').delete().eq('id', invite.id);
    return json({ error: 'Cannot work out this app\u2019s address. Set SITE_URL on the project.' }, 400);
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { full_name: fullName }, redirectTo: `${site}/join` },
  });

  if (linkErr) {
    await admin.from('invites').delete().eq('id', invite.id);
    const msg = String(linkErr.message ?? '');
    return json({
      error: /already|registered|exists/i.test(msg)
        ? `${email} already has an account here. Ask them to sign in, or reset their password.`
        : `The invitation was not sent: ${msg}`,
    }, 400);
  }

  // WHICH OF THE THREE TOKENS generateLink HANDS BACK, AND WHY IT MATTERS.
  //
  // It returns `hashed_token`, `email_otp` and a whole `action_link`. The first
  // version of this used `email_otp` and put it in the URL as `?code=`, and
  // every invitation died on arrival with "This invitation link is invalid or
  // has expired." `?code=` means something specific to the client library: it
  // is a PKCE authorization code, and redeeming one requires the code_verifier
  // that was stashed in localStorage BY THE BROWSER THAT STARTED THE FLOW.
  // Nothing started a flow here — a server minted this — and the person opening
  // it is on their phone, in a mail app, on a device that has never seen this
  // site. There is no verifier to find, so the exchange fails every time. It
  // was not an expiry and not a bad key: it was the wrong redemption route,
  // and it failed identically for everyone.
  //
  // `hashed_token` is the one that travels. It redeems through verifyOtp with
  // no prior browser state at all, which is exactly the property an emailed
  // link needs. `type=invite` tells the page which kind it is holding.
  const tokenHash = link?.properties?.hashed_token ?? '';
  if (!tokenHash) {
    await admin.from('invites').delete().eq('id', invite.id);
    return json({ error: 'The sign-in link could not be created. Nothing was sent.' }, 500);
  }
  const joinUrl = `${site}/join?token_hash=${encodeURIComponent(tokenHash)}&type=invite`;

  // The second address is the fallback for a mail client that mangles the long
  // one — some corporate filters rewrite links and break the hash. This one
  // redeems the short code instead, and a short code is only meaningful
  // alongside the address it was issued for, so the address travels with it.
  //
  // Both routes land on the same screen and both work exactly once. Giving the
  // reader a bare number and no way to use it, which is what the first draft
  // did, is not a fallback.
  const code = link?.properties?.email_otp ?? '';
  const codeUrl = code
    ? `${site}/join?code=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}&type=invite`
    : '';

  const sent = await sendInvitation({
    to: email,
    name: fullName,
    church: churchName,
    link: joinUrl,
    codeUrl,
  });

  if (!sent.ok) {
    // The account exists and the link is good even though the mail did not go,
    // so the invitation row STAYS and the Director is handed the link to pass
    // on by hand. Deleting it here would throw away a working invitation
    // because a mail server had a bad minute.
    return json({
      ok: true,
      invite_id: invite.id,
      delivery: 'link',
      link: joinUrl,
      mailNote: sent.reason,
    });
  }

  return json({ ok: true, invite_id: invite.id, delivery: 'email' });
});

/**
 * Send the invitation through Brevo.
 *
 * Provider-agnostic in shape: one function, one endpoint, three secrets. Moving
 * to Postmark or your own SMTP relay is an edit here and nowhere else.
 *
 *   BREVO_API_KEY   the key, starting xkeysib-
 *   MAIL_FROM       an address VERIFIED with the provider
 *   MAIL_FROM_NAME  optional; defaults to the church's own name
 *
 * Never throws. An invitation that exists and was not emailed is a far smaller
 * problem than an invitation that does not exist.
 */
async function sendInvitation(m: {
  to: string; name: string; church: string; link: string; codeUrl: string;
}): Promise<{ ok: boolean; reason: string }> {
  const key = (Deno.env.get('BREVO_API_KEY') || '').trim();
  const from = (Deno.env.get('MAIL_FROM') || '').trim();
  if (!key) return { ok: false, reason: 'No email service is configured yet, so the link is below to send by hand.' };
  if (!from) return { ok: false, reason: 'MAIL_FROM is not set, so the link is below to send by hand.' };
  const fromName = (Deno.env.get('MAIL_FROM_NAME') || m.church || 'Hope Beacon').trim();

  const first = (m.name || '').trim().split(/\s+/)[0] || 'there';
  const e = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
     .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const text = [
    `Hello ${first},`,
    '',
    `${m.church} has invited you to join them on Hope Beacon.`,
    '',
    'Hope Beacon is a private, invitation-only app where someone from the',
    'church walks with you, at whatever pace suits you.',
    '',
    'Open this link to set your password and finish joining:',
    m.link,
    '',
    m.codeUrl ? 'If that link does not open, try this one instead:' : '',
    m.codeUrl,
    '',
    "These links are just for you, and they work once. Please don't forward them.",
  ].filter(Boolean).join('\n');

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;max-width:520px;margin:0 auto;padding:24px">',
    `<p>Hello ${e(first)},</p>`,
    `<p><strong>${e(m.church)}</strong> has invited you to join them on Hope Beacon.</p>`,
    '<p>Hope Beacon is a private, invitation-only app where someone from the church walks with you, at whatever pace suits you.</p>',
    `<p style="margin:28px 0"><a href="${e(m.link)}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block">Accept the invitation</a></p>`,
    `<p style="font-size:14px;color:#4b5563">Or open this link:<br><a href="${e(m.link)}">${e(m.link)}</a></p>`,
    m.codeUrl ? `<p style="font-size:14px;color:#4b5563">If that link does not open, try this one instead:<br><a href="${e(m.codeUrl)}">${e(m.codeUrl)}</a></p>` : '',
    '<p style="font-size:14px;color:#6b7280">These links are just for you, and they work once. Please don&#39;t forward them.</p>',
    '</div>',
  ].join('');

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: from, name: fromName },
        to: [{ email: m.to, ...(m.name ? { name: m.name } : {}) }],
        subject: `${m.church} has invited you to Hope Beacon`,
        htmlContent: html,
        textContent: text,
      }),
    });
    if (res.ok) return { ok: true, reason: '' };

    let code = ''; let message = '';
    try { const b = await res.json(); code = String(b?.code ?? ''); message = String(b?.message ?? ''); } catch { /* status only */ }

    // Each of these needs a different fix, so each gets different words.
    if (res.status === 401) {
      return { ok: false, reason: /IP address/i.test(message)
        ? `Brevo refused the call because of its IP allow-list. Edge Functions have no fixed address, so switch the restriction off for this key. ${message}`
        : `Brevo rejected the credentials: ${message || 'no reason given'}.` };
    }
    if (/sender/i.test(code) || /sender/i.test(message)) {
      return { ok: false, reason: `Brevo will not send from ${from} until that address is verified. The link is below to send by hand meanwhile.` };
    }
    if (res.status === 429 || /limit/i.test(code)) {
      return { ok: false, reason: "Brevo's sending limit for today has been reached. The link is below." };
    }
    return { ok: false, reason: message || `The email service refused it (${res.status}).` };
  } catch {
    return { ok: false, reason: 'The email service could not be reached. The link is below.' };
  }
}
