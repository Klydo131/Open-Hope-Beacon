# Sending email

Hope Beacon sends exactly two kinds of message, and both are one sentence and a
link: **an invitation**, and **a password reset**. There is no newsletter, no
marketing, no digest. Whatever you use to deliver them can be small.

**Nothing here is required to run the app.** Without email configured, the app
still works: invitations are created and the link is shown on screen for the
Director to pass on however they like — WhatsApp, a printed slip, out loud.
Email is a convenience, and treating it as one is why a church with no budget
and no domain can still run this.

---

## What the app actually needs

One thing: **something that will deliver a short message to an address you
name.** That is the entire contract.

It does not need a marketing platform, a CRM, templates, tracking pixels, or an
account with anybody in particular. If you already run a mail server, use it.

Which piece of your stack sends the mail depends on how you built it:

| If your backend is | The mail goes out through | You configure it |
|---|---|---|
| An auth service with built-in mail (Supabase, Firebase, Auth0, Keycloak…) | That service's own SMTP settings | In its dashboard — no app change |
| Your own server / API | Whatever library or API you call | In your code |
| Nothing yet (sample-data mode) | Nothing — links are shown on screen | Nothing to do |

The reference deployment uses the first row. The app asks the auth service to
issue an invitation, and the auth service posts it. That is why most of this
page is about **choosing and verifying a sender**, not about code.

---

## Choosing a provider

Every provider will tell you about deliverability and volume. For a church
sending a handful of invitations a month, those are almost irrelevant. Three
things actually decide whether this works on the day:

**1. How it lets you prove you own the sending address.** This is the one that
stops people. There are two models:

- **Verify a single address.** You add `hello@example.org`, click a link in the
  email they send there, and you can write to anybody. Minutes, no DNS.
- **Verify a whole domain.** You add DNS records and wait for propagation. Better
  long-term deliverability, useless if you need to send this afternoon or do not
  control the domain's DNS.

Pick one that offers single-address verification unless you already control a
domain and have time.

**2. Whether the free tier can send to strangers.** Some free tiers deliver only
to the account owner's own address until a domain is verified. That restriction
is nearly invisible: the API accepts the message, returns success, and nothing
arrives. Read the free tier's limits before choosing, not after.

**3. Whether it has an IP allow-list, and whether it is on.** Serverless
functions have no fixed outbound address. If your provider restricts API access
by IP, it must be **off** for the key your app uses — adding one address will
appear to work once and then fail from a different region.

---

## Some options

Not endorsements, and not a complete list. Anything that speaks SMTP works.

| Provider | Verification | Free tier | Notes |
|---|---|---|---|
| **Brevo** | Single address | ~300/day | What the reference deployment uses. Check the IP allow-list setting. |
| **Postmark** | Domain | Trial only | Best deliverability of the common options; account approval is manual. |
| **Mailgun** | Domain | Trial | Fine if you control DNS. |
| **Amazon SES** | Either | Very cheap | Starts in a sandbox that only sends to verified addresses; leaving it is a support request. |
| **Resend** | Domain | Yes | Its shared sender delivers **only to the account owner**. Fine for testing, not for inviting members. |
| **Your own SMTP** | You already own it | — | Postfix, your diocese's server, a university relay. Nothing wrong with this. |
| **Gmail / Workspace SMTP** | — | — | Works, but sending as a `gmail.com` address through a third party fails DMARC alignment and can land in spam. Acceptable for testing, not for a launch. |

---

## Worked example: SMTP through your auth service

The generic shape. Every provider gives you these five values.

```
Host:      smtp.your-provider.example      # e.g. smtp-relay.brevo.com
Port:      587                             # 587 with STARTTLS is the usual choice
Username:  <from your provider>            # often not your email address
Password:  <the SMTP key, not your login password>
Sender:    hello@yourchurch.example        # MUST be verified with the provider
```

Put them in your auth service's SMTP settings. For Supabase that is
**Project Settings → Authentication → SMTP**. There is no code change and
nothing to redeploy.

Also set your **redirect URLs** in the same area, or the link in the mail will
land somewhere the app does not recognise and show a home page instead of a
sign-up form. Add both:

```
http://localhost:3000/join
https://your-deployment.example/join
```

---

## Worked example: an HTTP API instead of SMTP

If you are writing your own send path, most providers offer a plain HTTP
endpoint, which avoids SMTP configuration entirely. The shape is the same
everywhere:

```
POST https://api.your-provider.example/send
Headers: <auth header>, content-type: application/json
Body:    { from, to, subject, text, html }
```

Two rules worth following if you build this:

- **Keep the provider's name out of the calling code.** One module that sends a
  message, one place that knows which service it is. Changing provider should be
  a config change, not a search-and-replace.
- **Write the invitation record before you send.** An invitation is a decision
  somebody made; it should survive a mail server having a bad day. If you send
  first and store second, every provider outage silently discards a decision.

---

## Testing it, properly

**Send one real message to an address you can open.** Not a validation check,
not a green tick in a dashboard — an actual delivered email. Almost every mail
failure in this project's history looked fine right up to the inbox.

Then check the three things that break most often:

1. It arrived, and not in spam.
2. The link in it opens the sign-up page, not the home page. (Redirect URLs.)
3. Sending to a *different* address than your own also arrives. (Free-tier
   restrictions hide here.)

---

## When nothing arrives

| Symptom | Almost always |
|---|---|
| Provider returns 401 | Wrong key — **or** an IP allow-list rejecting a valid one. Read the response body; they say which. |
| Provider returns 403 on the sender | The From address is not verified yet. |
| API says success, nothing arrives | A free-tier restriction limiting delivery to the account owner. |
| Arrives, but in spam | Sending as a domain you do not control — a `gmail.com` From through a third-party relay is the usual cause. |
| Link opens the home page | Redirect URL not allow-listed. |
| Nothing at all, no error anywhere | Mail is not configured. The app is behaving correctly: the invitation exists and the link is on screen. |

Two habits worth keeping:

**Record what happened on the invitation itself.** A log rolls over; the row
stays. "Why did nothing arrive" should be answerable next week.

**Never collapse the reasons into one message.** "Email failed" is not
actionable. A bad key, an unverified sender and a daily cap need three different
fixes, and every provider tells you which one it is in the response body. Throw
that away and somebody spends an evening regenerating a key that was never
wrong.

---

## Turning it off

Remove the SMTP settings. The app returns to showing invitation links on screen.
Nothing breaks, and for a small church that may be the right permanent answer.
