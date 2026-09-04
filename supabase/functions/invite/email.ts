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

export type InviteRole = 'ds' | 'dm' | 'admin' | 'executive';

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
      ['Sign in with the password above.', 'Your account is already made, so there is nothing to set up first.'],
      ['Change the password.', 'Settings, then Change password. It takes a moment and it is worth doing today.'],
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
      ['Sign in with the password above.', 'Your account is already made, so there is nothing to set up first.'],
      ['Meet whoever is paired with you.', 'A Guide walks with at most five people at once. Five is a ceiling, not a target.'],
      ['Share from the church library.', 'You choose what each person sees, and when they are ready for it.'],
    ],
  },

  // Running the church. Named plainly, because somebody accepting this should
  // know before they click that they are taking on approving people.
  // Overseeing more than one congregation. Only another Executive Director can
  // send this, and the message says plainly what is being handed over, because
  // somebody accepting it can appoint Directors afterwards.
  executive: {
    word: 'Executive Director',
    subject: 'You have been asked to serve as an Executive Director',
    lead:
      'They would like you to serve as an Executive Director. You will oversee '
      + 'the churches you are given, and appoint the Directors who run them.',
    steps: [
      ['Sign in with the password above.', 'Your account is already made, so there is nothing to set up first.'],
      ['Appoint the Directors.', 'Each church is run day to day by its own Directors, and you decide who they are.'],
      ['Watch the one number that matters.', 'Explorers with no Guide. Everything else can wait a week; that cannot.'],
    ],
  },

  admin: {
    word: 'Director',
    subject: 'You have been asked to help lead Hope Beacon',
    lead:
      'They would like you to help lead as a Director. You will decide who '
      + 'joins, what they can see, and who walks with whom.',
    steps: [
      ['Sign in with the password above.', 'Your account is already made, so there is nothing to set up first.'],
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
 * The finished message. `appUrl` is the ordinary public home, used for the
 * install instructions. `joinUrl` is the one-time account link.
 *
 * THE INVITATION COMES FIRST, AND IT DID NOT USED TO.
 *
 * The original order put the install steps above the button, reasoning that a
 * recipient should not spend a one-time link before knowing which browser to
 * use. It reads sensibly and it was wrong, because of what people actually did
 * with it: they followed the install steps, and the installed app opens as a
 * fresh session with no invitation in it. Some never returned to the email at
 * all. Others came back, tapped the button, and it opened in the browser rather
 * than the app they had just installed. One Guide ended up with an account that
 * had no password and a spent link, and it had to be repaired by hand.
 *
 * Accepting is the only step that expires, works once, and cannot be done later
 * from anywhere else. Installing has no deadline, works from any browser, and
 * is explained inside the app under Settings. So the thing with a deadline goes
 * first, and the thing without one follows it.
 */
export function inviteHtml(
  role: InviteRole,
  churchName: string,
  joinUrl: string,
  appUrl: string,
  signInEmail: string,
  tempPassword: string,
): string {
  const copy = ROLE_COPY[role];
  const church = esc(churchName || 'Your church');
  const url = esc(joinUrl);
  const app = esc(appUrl);
  const who = esc(signInEmail);
  const pass = esc(tempPassword);
  const roomUse = role === 'dm' || role === 'ds'
    ? 'Open the <strong>Guild Room</strong> for group activity, then use the other rooms for your own journey or the people you walk with.'
    : 'Open <strong>Admin</strong>, then choose <strong>Security</strong> to review account activity. Admin also holds approvals, people, and church work.';

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

          <!-- THE CREDENTIALS COME BEFORE THE BUTTON, and the order is the
               request: "That email and password must be emphasized first
               before tapping the accept or join in to the Web app. Once the
               user read the email and password, they are ready to tap."
               Somebody who taps first and reads second arrives at a sign-in
               box holding nothing, goes back to the mail, and half of them do
               not come back. So the two things they will be asked for are the
               first things on the page, in a box that cannot be mistaken for
               body text, and the button sits underneath them. -->
          <p style="margin:24px 0 10px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;color:#1E2A4A;letter-spacing:0.6px;text-transform:uppercase;">Step 1 &middot; Your sign-in details</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F8FF;border:2px solid #2F80ED;border-radius:10px;margin:0 0 14px 0;">
            <tr><td style="padding:22px 24px;font-family:Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#22272F;">Write these down or keep this email open. You will be asked for both.</p>

              <p style="margin:0 0 4px 0;font-size:12px;font-weight:bold;color:#5B6472;letter-spacing:0.6px;text-transform:uppercase;">E-mail</p>
              <p style="margin:0 0 16px 0;font-family:Courier,'Courier New',monospace;font-size:17px;line-height:1.4;color:#1E2A4A;font-weight:bold;word-break:break-all;">${who}</p>

              <p style="margin:0 0 4px 0;font-size:12px;font-weight:bold;color:#5B6472;letter-spacing:0.6px;text-transform:uppercase;">Password</p>
              <p style="margin:0 0 10px 0;font-family:Courier,'Courier New',monospace;font-size:22px;line-height:1.4;color:#1E2A4A;font-weight:bold;letter-spacing:0.5px;word-break:break-all;">${pass}</p>
              <p style="margin:0;font-size:14px;line-height:1.5;color:#5B6472;">All small letters, with the dashes. Type it exactly as it appears.</p>
            </td></tr>
          </table>

          <!-- THE WARNING SITS WITH THE PASSWORD, not in a footer nobody
               reaches. It is also honest about the choice being theirs: the
               owner's instruction was a strong note to change it, "but if they
               dont change the password from the email, it's up to the user".
               So this urges and does not threaten, and nothing in the app
               refuses to work until they comply. -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:4px solid #C0392B;background-color:#FDF2F0;border-radius:0 8px 8px 0;margin:0 0 26px 0;">
            <tr><td style="padding:16px 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#7A2A20;">
              <strong style="font-size:16px;">This password is temporary. Please change it.</strong><br>
              It was created for you so you can get in today. Anybody who can read this
              e-mail can use it, so change it to one only you know: open Hope&nbsp;Beacon,
              go to <strong>Settings</strong>, then <strong>Change password</strong>.
              It takes a moment, and the app will remind you until you do.
            </td></tr>
          </table>

          <p style="margin:0 0 10px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;color:#1E2A4A;letter-spacing:0.6px;text-transform:uppercase;">Step 2 &middot; Open the app</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
            <tr><td align="center" bgcolor="#1E2A4A" style="border-radius:8px;">
              <a href="${url}" style="display:inline-block;padding:15px 34px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">Sign in to Hope Beacon</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#5B6472;">If the button does not work, copy this address into your browser:</p>
          <p style="margin:0 0 22px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;word-break:break-all;">
            <a href="${url}" style="color:#2F80ED;text-decoration:underline;">${url}</a>
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:3px solid #E8B84B;background-color:#FFFBF0;border-radius:0 8px 8px 0;margin:0 0 26px 0;">
            <tr><td style="padding:14px 18px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#5B4A1E;">
              <strong>Nothing here expires and nothing runs out.</strong> You can open this e-mail as many times as you like, on any device, and sign in whenever you are ready. If your church sends a newer invitation, use the password from the newest one.
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F6FA;border-radius:10px;margin:0 0 26px 0;">
            <tr><td style="padding:20px 22px;font-family:Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 14px 0;font-size:13px;font-weight:bold;color:#1E2A4A;letter-spacing:0.6px;text-transform:uppercase;">What happens next</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}
              </table>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F6FA;border-radius:10px;margin:0 0 26px 0;">
            <tr><td style="padding:20px 22px;font-family:Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 8px 0;font-size:13px;font-weight:bold;color:#1E2A4A;letter-spacing:0.6px;text-transform:uppercase;">Using the app</p>
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.55;color:#22272F;">Sign in with the e-mail and password above, then change the password to one only you know. Use the Hope Beacon icon whenever you return.</p>
              <p style="margin:0;font-size:15px;line-height:1.55;color:#22272F;">${roomUse}</p>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #DCE5F2;border-radius:10px;margin:0 0 20px 0;">
            <tr><td style="padding:20px 22px;font-family:Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 8px 0;font-size:13px;font-weight:bold;color:#1E2A4A;letter-spacing:0.6px;text-transform:uppercase;">Next: install Hope Beacon</p>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#22272F;">Once your account is set up, add Hope Beacon to your Home Screen so it opens like an app. There is no rush, and these steps are also inside the app under Settings.</p>

              <p style="margin:0 0 6px 0;font-size:15px;line-height:1.5;color:#1E2A4A;"><strong>Safari on iPhone or iPad</strong></p>
              <ol style="margin:0 0 16px 20px;padding:0;font-size:15px;line-height:1.55;color:#22272F;">
                <li>Open <a href="${app}" style="color:#2F80ED;text-decoration:underline;">Hope Beacon</a> in Safari.</li>
                <li>Tap <strong>Share</strong>, then choose <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong>. Hope Beacon now opens from its own icon.</li>
              </ol>

              <p style="margin:0 0 6px 0;font-size:15px;line-height:1.5;color:#1E2A4A;"><strong>Other browsers</strong></p>
              <ol style="margin:0 0 8px 20px;padding:0;font-size:15px;line-height:1.55;color:#22272F;">
                <li>Open <a href="${app}" style="color:#2F80ED;text-decoration:underline;">Hope Beacon</a> in the browser you use.</li>
                <li>Open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>; the exact words vary by browser.</li>
                <li>Use the new Hope Beacon icon to open the app.</li>
              </ol>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#5B6472;">On iPhone and iPad, use Safari for the install steps above. Other iOS browsers can open Hope Beacon, but Safari is the reliable way to add it to your Home Screen.</p>
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
