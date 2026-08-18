# Email

**Nothing to set up.** Hope Beacon sends its invitations through Supabase's own
email service, which every Supabase project has. No account with a third party,
no API key to store, no sender address to verify. Clone this project, run the
migrations, and invitations work.

---

## How an invitation is actually sent

`supabase/functions/invite/index.ts` runs on your own Supabase project and does
two things depending on whether the person already has an account:

| Situation | What is sent |
|---|---|
| A new address | `inviteUserByEmail` — creates the account and sends "you have been invited" |
| Someone who never finished joining | `resetPasswordForEmail` — sends "set a password" |

Both messages link to `/join`, which is the screen that finishes the sign-up
either way. Pressing **Re-send** on a waiting invitation mints a fresh link and
posts it again, with nothing to retype.

## What this costs you

Being honest about the trade, because it matters at a certain size:

- **The wording is Supabase's, not your church's.** The message comes from your
  project's Auth email template. You can rewrite that template in the Supabase
  dashboard under **Authentication → Email Templates** and it will say whatever
  you like.
- **It is rate limited.** A handful of messages an hour, and one per address per
  minute. Inviting people a few at a time is fine. Inviting two hundred in one
  afternoon is not.

If you press Send twice quickly you will see *"wait N seconds"*. That is the
per-address limit, not a failure — the first message was accepted.

## Why not a third-party provider by default

This project used to post invitations to Brevo, and it cost a full day of a
church's time in a way worth recording.

Everything was configured correctly. The API key, the verified sender and the
site URL were all present and all loaded — the function's own log confirmed it
on every attempt. Every call was refused anyway, because the Brevo account had
its **IP allow-list** switched on, and Supabase Edge Functions have no fixed IP
address to add to it. Two consecutive attempts were rejected from two different
servers. Invitations silently stopped because of a setting in a third party's
dashboard that could not be seen from inside the app.

None of that can happen with Supabase's mailer. It is sent by Supabase, from
inside Supabase.

## Adding a provider, when you outgrow the built-in service

You will want one eventually: your own wording, your own domain, and no rate
limit. The send lives in **one place** — the block marked `SEND IT` in
`supabase/functions/invite/index.ts`. Replace those two calls with a POST to
your provider and nothing else in the app changes.

Whichever provider you choose:

- **Verify your sending address with them first.** Most refuse to send from an
  address they have not confirmed is yours, and the error rarely says so
  plainly.
- **Do not switch on an IP allow-list.** Edge Functions have no fixed address.
  This is the one that cost the day above.
- **Keep the key out of the browser.** It belongs in Edge Function secrets
  (**Edge Functions → Secrets**), or failing that in the `app_settings` table,
  which has row level security on with no policies and every grant revoked from
  `PUBLIC` — so only the service role can read it. Never in a
  `NEXT_PUBLIC_` variable.

## When an invitation cannot be emailed

The Director gets the one-time link on screen with a **Copy link** button, and
the invitation stays open. The account is real and the link works; only the
postman is missing. Sending it by hand — WhatsApp, Messenger, in person — takes
the person through exactly the same sign-up.

That path is deliberate. An email service having a bad afternoon should not stop
a church inviting somebody standing in front of them.
