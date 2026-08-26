# Email templates

Two files, pasted into the Supabase dashboard. Nothing here is deployed with the
app: Auth email bodies are a project setting, and no code in this repository
reads them.

| File | Paste into | Subject line to set |
|---|---|---|
| `invite.html` | Authentication → Emails → **Invite user** | `You're invited to Hope Beacon` |
| `recovery.html` | Authentication → Emails → **Reset password** | `Set your Hope Beacon password` |

Paste the **whole file**, replacing everything already in the box.

## Rules these files follow, and why breaking them breaks the email

**Only `{{ .ConfirmationURL }}`.** No other variable, in either file.

An earlier version also used `{{ .Email }}`. It arrived as a blank message. Go
renders these templates, and a field it cannot resolve aborts the render rather
than leaving a gap — an empty body is the failure mode, and nothing anywhere
reports it. The link is the only thing the message genuinely needs, so it is the
only thing referenced.

**No HTML comments.** The documentation lives in this file instead. Comments
inside a pasted template are body content that a mail client may or may not
strip, and a `{{ ... }}` mentioned inside one is still substituted, because Go
templating does not know what an HTML comment is.

**Tables and inline styles only.** Outlook renders with Word's engine, several
clients drop `<style>` blocks, and none support flexbox or grid. Anything modern
here looks right in a browser and broken in the inbox, which is the only place
these are ever seen.

**No images, including the logo.** Images need a public URL and are blocked by
default in most clients, so a logo would be an empty box for most readers. The
mark is a table cell with a border-radius: it degrades to a coloured square
rather than to nothing.

## Set the subject lines, and do not leave them at the default

Both default to `You've been invited`. Gmail threads by subject, and collapses
the body of a later message in a thread behind **Show quoted text** when it
resembles an earlier one. Two invitations to the same person then look like one
invitation and one empty message. Distinct subjects keep them apart.

## The reset template has two audiences

It is not only for people who forgot a password.

Re-sending an invitation to somebody who has an account but never finished
signing up falls through to `resetPasswordForEmail`, because `inviteUserByEmail`
refuses an address that is already registered. So a person being invited a
**second** time receives the reset mail, not the invitation one.

Worded for forgetfulness alone, that message tells somebody they requested
something they did not request, about an account they do not know they have.
Hence "Set your password" rather than "Reset your password", and a first line
that covers both arrivals without guessing which reader it has.

## Checking a change

`tests/email-templates.mjs` holds the two rules that produced silent failures:
only `{{ .ConfirmationURL }}` appears, and no HTML comments survive. It runs as
part of `npm test`.
