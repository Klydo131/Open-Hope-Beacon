# Email

**Nothing to set up.** Hope Beacon sends its invitations through Supabase's own
email service, which every Supabase project has. No account with a third party,
no API key to store, no sender address to verify. Clone this project, run the
migrations, and invitations work.

> **Read this before your first busy day.** The built-in service sends **two
> messages an hour for the entire project**. That is fine for a church inviting
> one person at a time and will quietly strand you if you sit down to invite
> ten. [Connecting an SMTP provider](#adding-a-provider--sooner-than-eventually-if-you-invite-in-batches)
> is a dashboard form, takes about five minutes, and raises it to thirty an
> hour.

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
- **It sends two messages an hour. For the whole church.** Not per person —
  two, in total, per project, per hour. This number is measured, not estimated:
  the auth log of a real church shows at most two successes in any hour and
  `over_email_send_rate_limit` on everything after.
- **And one message per address per minute**, separately from the above.

### What that means on the day you actually invite people

If your Director invites four people in one sitting, **two of those invitations
are never sent.** The screen used to show the provider's raw refusal, which
reads like a fault; it now says plainly that the hour's email is spent and hands
over the join link for the person in front of you.

**This limit cannot be raised while the built-in mailer is in use.** It is not a
setting in your dashboard. The only way to send more is to connect an email
provider, below — which is why the section under it exists.

### Telling the two refusals apart

Both come back as HTTP 429 and they mean different things:

| What you see | What it is | What to do |
|---|---|---|
| *"wait N seconds"* | One per address per minute. The first message **was** accepted. | Wait, press Send once. |
| *"used up its email for the hour"* | The project's two-an-hour quota is spent. **Nothing was sent.** | Send the link on screen by hand, or connect a provider. |

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

## Adding a provider — sooner than "eventually", if you invite in batches

Two an hour is enough for a church adding one person after a Sabbath
conversation. It is not enough for a launch, a training weekend, or a
demonstration. If you have more than two people to invite in an hour, you need
this section, and the good news is that it is a dashboard form rather than code.

### The easy way: custom SMTP (no code at all)

Supabase's own Auth service will use your provider's SMTP server if you give it
one, under **Project Settings → Authentication → SMTP Settings**. Everything in
this app keeps working exactly as it does now — same function, same templates,
same links — and the default quota rises from two an hour to **thirty new users
an hour**, which is itself configurable under **Authentication → Rate Limits**.

You need four things from your provider: host, port, username, and password.
Every provider's dashboard calls these "SMTP credentials".

> **If you use Brevo:** SMTP credentials are a *different* credential from the
> REST API key that failed here before. The IP allow-list that blocked this app
> was on the API-key path. Whether Brevo also applies it to SMTP is not
> something this project has tested — check it in their dashboard before
> relying on it, and if invitations stop again, that setting is the first place
> to look.

### The other way: post to a provider's API from the function

Only if you want your church's own wording in the message body rather than
Supabase's template. The send lives in **one place** — the block marked
`SEND IT` in `supabase/functions/invite/index.ts`. Replace those two calls with
a POST to your provider and nothing else in the app changes.

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
