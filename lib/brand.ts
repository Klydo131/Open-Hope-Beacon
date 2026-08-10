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

export const ROLE_LABELS: Record<string, string> = {
  executive: 'Executive Admin',
  admin: 'Admin',
  dm: 'Digital Missionary',
  ds: 'Digital Seeker',
};

export function canKick(callerRole: string, targetRole: string): boolean {
  if (callerRole === 'executive') return ['admin', 'dm', 'ds'].includes(targetRole);
  if (callerRole === 'admin') return ['dm', 'ds'].includes(targetRole);
  if (callerRole === 'dm') return targetRole === 'ds';
  return false;
}

export function canDisapprove(callerRole: string): boolean {
  return callerRole === 'executive' || callerRole === 'admin';
}
