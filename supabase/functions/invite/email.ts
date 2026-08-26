// The invitation, composed here, in three versions.
//
// WHY THIS FILE EXISTS AT ALL.
//
// Supabase Auth has exactly ONE "Invite user" template. Everybody who joins a
// church gets the same words whether they are being asked to be walked with, to
// walk with five others, or to run the congregation. There is no branch in that
// system to hang a role on, so the moment the owner asked for three different
// invitations, the Supabase template stopped being able to do the job.
//
// The alternative was three templates in Brevo's editor and a template id per
// role, which works and is still supported below -- but it puts the words a
// congregation reads behind a dashboard nobody has version control over, and
// somebody has to build and activate three of them by hand before a single
// invitation can go out.
//
// So the default is this: the function composes the message. The copy lives in
// git, changes go through review, and the rendering is covered by a test that
// checks all three roles rather than by remembering to click Preview.
//
// NO CONDITIONALS ANYWHERE IN THE OUTPUT. An earlier Brevo template used
// `{% if %}` blocks, and Brevo's preview showed them as literal text -- which is
// expected in preview, and left no way to confirm whether the engine resolves
// them at send time or ships them to the reader verbatim. That question does
// not arise here: the branch happens in TypeScript and what leaves this file is
// finished HTML.
//
// TABLES AND INLINE STYLES. Outlook renders with Word's engine, several clients
// drop <style> blocks, and none support flexbox or grid. Anything modern would
// look right in a browser and broken in the inbox, which is the only place this
// is ever seen. No images either, including the logo: images are blocked by
// default in most clients, so it would be an empty box for most readers. The
// mark is a table cell with a border-radius, which degrades to a coloured
// square rather than to nothing.

export type InviteRole = 'ds' | 'dm' | 'admin';

interface RoleCopy {
  /** What this person is called on screen and in the message. */
  word: string;
  /** The subject line. Distinct per role so a Gmail thread cannot collapse them. */
  subject: string;
  /** The sentence under the heading. */
  lead: string;
  /** Three things that happen next, as [bold opening, rest]. */
  steps: [string, string][];
}

const ROLE_COPY: Record<InviteRole, RoleCopy> = {
  // Being walked with. The reassurance is the point: an Explorer is often the
  // most hesitant person in this list, and the thing they most need to know is
  // that nobody else can see any of it.
  ds: {
    word: 'Explorer',
    subject: 'You are invited to Hope Beacon',
    lead:
      'Someone from the church would like to walk alongside you, at whatever '
      + 'pace suits you. Nobody else can see your journey, and nothing is '
      + 'shared beyond the person walking with you.',
    steps: [
      ['Choose a password.', 'That is what finishes your sign-up. Nothing else is required.'],
      ['Tell us your name.', 'Everything beyond that is optional and yours to give or keep.'],
      ['Someone will be paired with you.', 'A Guide from your church, who will say hello.'],
    ],
  },

  // Walking with others. The five is stated in the invitation because it is the
  // single most important thing about the job and the thing most likely to be
  // misunderstood as a target rather than a ceiling.
  dm: {
    word: 'Guide',
    subject: 'You have been asked to be a Guide',
    lead:
      'They would like you to walk alongside others as a Guide. You will be '
      + 'paired with people one at a time, and each conversation stays between '
      + 'you and them.',
    steps: [
      ['Choose a password.', 'That is what finishes your sign-up.'],
      ['Meet whoever is paired with you.', 'A Guide walks with at most five people at once, on purpose. Five is a ceiling, not a target.'],
      ['Share from the church library.', 'You choose what each person sees, and when they are ready for it.'],
    ],
  },

  // Running the church. Named plainly, because somebody accepting this should
  // know before they click that they are taking on approving people.
  admin: {
    word: 'Director',
    subject: 'You have been asked to help lead Hope Beacon',
    lead:
      'They would like you to help lead as a Director. You will decide who '
      + 'joins, what they can see, and who walks with whom.',
    steps: [
      ['Choose a password.', 'That is what finishes your sign-up.'],
      ['Approve the people waiting.', 'You choose their role as you approve them, and that decides what they can see. Nobody can change their own role afterwards, including you.'],
      ['Pair every Explorer with a Guide.', 'An Explorer with no Guide is the one number worth watching. Your dashboard opens on it.'],
    ],
  },
};

/** Escape anything that reaches the HTML from the database. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function subjectFor(role: InviteRole): string {
  return ROLE_COPY[role].subject;
}

export function roleWord(role: InviteRole): string {
  return ROLE_COPY[role].word;
}

/**
 * The finished message. `joinUrl` is the one-time link and appears twice: once
 * as the button and once as copyable text, because a button that will not
 * render is a dead end and a URL never is.
 */
export function inviteHtml(
  role: InviteRole,
  churchName: string,
  joinUrl: string,
): string {
  const copy = ROLE_COPY[role];
  const church = esc(churchName || 'Your church');
  const url = esc(joinUrl);

  const steps = copy.steps
    .map(([head, rest], i) => `
                    <tr>
                      <td width="26" valign="top" style="font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#2F80ED;line-height:1.5;">${i + 1}</td>
                      <td valign="top" style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#22272F;${i < copy.steps.length - 1 ? 'padding-bottom:10px;' : ''}"><strong>${esc(head)}</strong> ${esc(rest)}</td>
                    </tr>`)
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF1F6;margin:0;padding:0;width:100%;">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
        <tr><td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
            <td width="40" height="40" align="center" valign="middle" style="background-color:#2F80ED;border-radius:11px;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:bold;line-height:40px;">B</td>
            <td width="10">&nbsp;</td>
            <td valign="middle" style="font-family:Helvetica,Arial,sans-serif;font-size:21px;font-weight:bold;color:#1E2A4A;letter-spacing:-0.3px;">Hope&nbsp;Beacon</td>
          </tr></table>
        </td></tr>
      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:14px;">
        <tr><td style="padding:40px 44px 36px 44px;font-family:Helvetica,Arial,sans-serif;">

          <h1 style="margin:0 0 6px 0;font-family:Helvetica,Arial,sans-serif;font-size:27px;line-height:1.25;color:#1E2A4A;font-weight:bold;">${esc(copy.subject)}</h1>

          <p style="margin:0 0 20px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#5B6472;">
            <strong style="color:#1E2A4A;">${church}</strong> has invited you. ${esc(copy.lead)}
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;border-top:1px solid #E4E9F0;border-bottom:1px solid #E4E9F0;">
            <tr><td style="padding:12px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#5B6472;">
              Invited as <strong style="color:#1E2A4A;">${esc(copy.word)}</strong>
            </td></tr>
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px 0;">
            <tr><td align="center" bgcolor="#1E2A4A" style="border-radius:8px;">
              <a href="${url}" style="display:inline-block;padding:15px 34px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">Accept your invitation</a>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F6FA;border-radius:10px;margin:0 0 26px 0;">
            <tr><td style="padding:20px 22px;font-family:Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 14px 0;font-size:13px;font-weight:bold;color:#1E2A4A;letter-spacing:0.6px;text-transform:uppercase;">What happens next</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}
              </table>
            </td></tr>
          </table>

          <p style="margin:0 0 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#5B6472;">If the button does not work, copy this address into your browser:</p>
          <p style="margin:0 0 26px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;word-break:break-all;">
            <a href="${url}" style="color:#2F80ED;text-decoration:underline;">${url}</a>
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:3px solid #E8B84B;background-color:#FFFBF0;border-radius:0 8px 8px 0;">
            <tr><td style="padding:14px 18px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#5B4A1E;">
              This link works <strong>once</strong>, and only the most recent invitation works. If your church sends another, use the newest email. Open it on the device you want to use Hope&nbsp;Beacon on.
            </td></tr>
          </table>

        </td></tr>
      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr><td align="center" style="padding:22px 24px 0 24px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:#8892A0;">
          You received this because a leader at ${church} invited you. If you were not expecting it, you can ignore this message and no account will be used.
        </td></tr>
      </table>

    </td>
  </tr>
</table>`;
}
