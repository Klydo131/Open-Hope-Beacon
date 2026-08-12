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

/** One sentence. Shown by link previews and by an installer. */
export const APP_DESCRIPTION =
  'A disciple-making journey app for local churches. Sample data only — ' +
  'not a real church record.';

/** The two ends of the logo gradient, left to right. */
export const BRAND_FROM = '#2F80ED';
export const BRAND_TO = '#3EB489';

export const NAVY = '#1E2A4A';
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
//   'Support' rather than 'Admin'             — the job is helping the church run,
//                                               not administering people.
//   nothing at all for a seeker               — see below.
//
// A SEEKER HAS NO LABEL, DELIBERATELY. Everyone else in this app has a job;
// a seeker is just a person who came. Printing 'Digital Seeker' under their name
// sorts them into a category in front of the very people walking with them, and
// the client asked for their name and nothing else. Use `roleLabel()` rather
// than reading this map directly, so the empty case is handled once.
export const ROLE_LABELS: Record<string, string> = {
  executive: 'Executive Support',
  admin: 'Support',
  dm: 'Guide',
  ds: '',
};

/**
 * The label to show beside somebody's name, or null when there should be none.
 *
 * Returning null rather than '' is the point: a caller has to decide what to do
 * with the absence. Reading ROLE_LABELS directly produced "You are now a ." and
 * an empty subtitle floating under a name, which is how a blank string fails —
 * quietly, and only in the places nobody re-read.
 */
export function roleLabel(role: string): string | null {
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
