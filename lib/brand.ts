import type { Stage, Track } from './types';

// ---------------------------------------------------------------------------
// Your church's name for this app. Change these lines and nothing else.
//
// This is the first thing most forks want to change, so it is deliberately the
// first thing in the first file. Every place a person reads the name — the
// browser tab, the header, the installed app on a phone home screen — comes
// from here. Nothing hard-codes it, and tests/brand-consistency.mjs fails if
// something starts to.
// ---------------------------------------------------------------------------

/** The full name. Browser tab, installed app, the "about" line. */
export const APP_NAME = 'Open Hope Beacon';

/** The short name. Used where space is tight: the header, a home-screen label. */
export const APP_SHORT_NAME = 'Hope Beacon';

/**
 * One sentence. Shown by link previews and by an installer.
 *
 * WHAT THIS APP IS ABOUT, said in the order that matters. It used to open
 * "A disciple-making journey app for local churches" — which describes the
 * customer rather than the point. A church is who runs it; walking with Christ
 * is what it is for, and that is what somebody sent a link should read first.
 * The vocabulary inside the app is untouched: "your church invited you" is
 * still a church, because there it means an actual congregation.
 */
export const APP_DESCRIPTION =
  'Walking with Christ, one step at a time — and never on your own. ' +
  'A church pairs you with someone who walks it with you.';

/** The two ends of the logo gradient, left to right. */
export const BRAND_FROM = '#2F80ED';
export const BRAND_TO = '#3EB489';

export const NAVY = '#1E2A4A';

/**
 * The tutorial's own colour.
 *
 * The tutorial used to be drawn in NAVY, exactly like the live app: same mark,
 * same title, same gold Sign in, same "I have an invitation". A person who
 * pressed "Open the tutorial" landed on a screen indistinguishable from the one
 * they had just left and reasonably concluded nothing had happened.
 *
 * That is not only confusing, it is the failure the demo ribbon was written to
 * prevent — somebody typing a real person's details into sample data because
 * nothing on screen said which app they were in. A colour is the one signal
 * that works before anybody reads a word.
 *
 * Deep plum rather than a warning colour: the tutorial is a legitimate part of
 * the product, not a mistake to escape from. It matches the purple the demo
 * notice has always used.
 */
export const TUTORIAL_PURPLE = '#4C3575';
export const GOLD = '#E8B84B';

// The six disciple-making stages, in order, with the brand color for each.
// Traditional track = orange family, merges to gold at "Call", greens to
// "Commission". Colors come straight from the design spec.
export const STAGES: { key: Stage; label: string; color: string; blurb: string }[] =
  [
    { key: 'create', label: 'Create', color: '#F5921B', blurb: 'First contact' },
    { key: 'connect', label: 'Connect', color: '#EA7C1F', blurb: 'Building rapport' },
    { key: 'care', label: 'Care', color: '#E0703C', blurb: 'Walking alongside' },
    { key: 'call', label: 'Call', color: '#E8B84B', blurb: 'Point of decision' },
    {
      key: 'cultivate',
      label: 'Cultivate',
      color: '#A9C24A',
      blurb: 'Growing in faith',
    },
    {
      key: 'commission',
      label: 'Commission',
      color: '#7FB03A',
      blurb: 'Sent to disciple',
    },
  ];

export const STAGE_ORDER: Stage[] = STAGES.map((s) => s.key);

export function stageInfo(stage: Stage) {
  return STAGES.find((s) => s.key === stage) ?? STAGES[0];
}

export function stageIndex(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function nextStage(stage: Stage): Stage | null {
  const i = stageIndex(stage);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

export function trackColor(track: Track): string {
  return track === 'traditional' ? '#EA7C1F' : '#2F80ED';
}

// What each role is CALLED on screen. The database still stores 'dm', 'ds',
// 'admin' and 'executive' — every permission rule is written against those, and
// renaming them would mean rewriting the security model to change a word.
//
// The wording came from the client, and the reasoning is worth keeping:
//
//   'Guide' rather than 'Digital Missionary'  — describes what the person does
//                                               rather than a title to live up to.
//   'Director' rather than 'Admin'            — the job is leading the church's
//                                               Hope Beacon ministry, not
//                                               administering people.
//   'Executive Director' above that           — the same job across more than
//                                               one church.
//   'Explorer' for a seeker                   — someone exploring the world of
//                                               SDA values.
//
// A ROLE LABEL IS NOT A BADGE THE PERSON WEARS. This replaced an earlier rule
// here, which was to give a seeker no label at all. That rule's reasoning was
// right — printing a category under somebody's name sorts them in front of the
// very people walking with them — but it also left a Guide unable to tell who
// was who on a roster, and it left the app with no word for the person it
// exists to serve.
//
// So the label exists, and it is scoped to the READER instead of deleted:
// 'Explorer' renders for a Guide, a Director and an Executive Director, and it
// renders nowhere the app tells you what YOU are — not your own header, not
// your own profile, not the welcome notification. It is how the people
// supporting someone refer to them, not something said back to the person.
//
// Everyone else's label is unconditional: a Guide seeing "Guide" under their
// own name is a job title, and an Explorer needs to see "Guide" under the name
// of the person walking with them.
//
// If you are forking this and want different words, this map is the only place
// to change them. If you want a different RULE, change roleLabel() — and the
// test in tests/brand-consistency.mjs will tell you what you broke.
export const ROLE_LABELS: Record<string, string> = {
  executive: 'Executive Director',
  admin: 'Director',
  dm: 'Guide',
  ds: 'Explorer',
};

/** The roles that read a roster, and so are shown an Explorer's label. */
const SEES_EXPLORER_LABEL = ['dm', 'admin', 'executive'];

/**
 * The label to show beside somebody's name, or null when there should be none.
 *
 * @param role   whose label this is — the person being described.
 * @param viewer the role of the person reading the screen.
 *
 * `viewer` is REQUIRED, and that is the whole design. Optional would mean every
 * call site that forgot it silently fell back to showing the label, which is
 * the one outcome this exists to prevent — a rule that fails open is not a
 * rule, and it would fail open in exactly the screens nobody re-reads.
 *
 * In most call sites the answer is "the same person", because the screen is
 * your own header or your own profile — so `roleLabel(me.role, me.role)` is the
 * common shape, and it reads as what it is: you, looking at yourself.
 */
export function roleLabel(role: string, viewer: string): string | null {
  if (role === 'ds' && !SEES_EXPLORER_LABEL.includes(viewer)) return null;
  const label = ROLE_LABELS[role];
  return label ? label : null;
}

/**
 * A word for the role when the interface HAS to name it — a chooser, a
 * "who are you?" card, an explanation of who the app is for.
 *
 * These are two different jobs and conflating them is how the blank-label
 * change goes wrong. A badge under somebody's name should say nothing for a
 * seeker: they are a person, not a category, and that is the whole request.
 * But an option in a picker cannot be blank — nobody can choose an empty row —
 * and a card headed by nothing is broken rather than tactful.
 *
 * So a seeker is described here rather than titled: "Someone exploring" says
 * what is true without pinning a label on anybody, and it is never shown beside
 * their own name.
 */
export function roleNoun(role: string): string {
  return ROLE_LABELS[role] || 'Explorer';
}

export function canKick(callerRole: string, targetRole: string): boolean {
  if (callerRole === 'executive') return ['admin', 'dm', 'ds'].includes(targetRole);
  if (callerRole === 'admin') return ['dm', 'ds'].includes(targetRole);
  if (callerRole === 'dm') return targetRole === 'ds';
  return false;
}

export function canDisapprove(callerRole: string): boolean {
  return callerRole === 'executive' || callerRole === 'admin';
}
