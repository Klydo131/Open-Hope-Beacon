// What's new: the release notes people actually read.
//
// A version number tells you a build changed. It does not tell you what changed,
// which is the only part anyone cares about. This is the list, newest first, in
// plain language. No commit hashes, no internal names, nothing a person would
// have to be a developer to parse.
//
// Add an entry at the TOP whenever a release goes out. `id` must be unique and
// must never be reused, because it is what the app remembers to work out which
// notes a person has already seen.

export interface ReleaseNote {
  id: string; // stable, never reused
  date: string; // YYYY-MM-DD
  title: string;
  items: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: '2026-08-03-orbit-video',
    date: '2026-08-03',
    title: 'Orbit video keeps original quality',
    items: [
      'Videos saved to Beacon now play in an Orbit-styled full-size player with seeking, volume and fullscreen controls.',
      'Beacon keeps the original file on this device and shows its actual resolution. 4K/60 playback depends on the file format, browser, device and display.',
      'Beacon checks that a video can play before saving it and explains when a different format is needed.',
    ],
  },
  {
    id: '2026-08-03-reliable-feedback',
    date: '2026-08-03',
    title: 'Clearer, safer feedback',
    items: [
      'Unfinished words stay on your device, so a closed form or failed connection does not erase them.',
      'Beacon shows a receipt only after your feedback is actually saved. If storage is unavailable, it says so and keeps your words ready to copy or retry.',
      'Your feedback record does not include your IP address, browser or device details, cookies, or church records.',
    ],
  },
  {
    id: '2026-07-30-home-orbit',
    date: '2026-07-30',
    title: 'Church home, a real music player, and updates you can see',
    items: [
      'New Home board. Announcements, milestones and new members all in one place, before your own dashboard.',
      'Orbit is now a full mini player. Upload your own music and video, search it, build playlists, and delete what you no longer want. Everything stays on your device.',
      'This “What’s new” panel, so you can always see what changed.',
      'The app now checks for updates on its own, without needing to be reinstalled.',
    ],
  },
  {
    id: '2026-07-30-tutorial',
    date: '2026-07-30',
    title: 'The tutorial works properly now',
    items: [
      'It guides you to the right screen instead of saying “not on this screen”.',
      'You can replay it any time from Settings, and it never changes your demo data.',
      'Fixed steps that pointed at buttons which were not on screen yet.',
    ],
  },
  {
    id: '2026-07-29-offline',
    date: '2026-07-29',
    title: 'Works offline, and tells you when you are',
    items: [
      'Every screen now works with no signal, not only the ones you had already opened.',
      'A clear Offline and Back online indicator, plus a Connection row in Settings.',
      'Your saved library files and notes are always available offline.',
    ],
  },
  {
    id: '2026-07-29-library',
    date: '2026-07-29',
    title: 'A real starter library',
    items: [
      'The Bible, Ellen G. White’s writings, the church’s statements of belief and this quarter’s Sabbath School. All free, all from the official publishers.',
      'Play saved audio and video straight from your library.',
      'YouTube and Facebook links open in place, only when you tap them.',
    ],
  },
];

export const LATEST_NOTE_ID = RELEASE_NOTES[0]?.id ?? '';

const SEEN_KEY = 'beacon-seen-notes';

export function seenNoteIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function markNotesSeen() {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(RELEASE_NOTES.map((n) => n.id)));
  } catch {
    // Not being able to remember is a small loss; never let it throw.
  }
}

// How many notes this person has not read yet. A first-time user has "seen"
// nothing, but showing them a badge for four historical releases is noise, so a
// device with no record at all is treated as caught up.
export function unseenCount(): number {
  const seen = seenNoteIds();
  if (seen.length === 0) return 0;
  return RELEASE_NOTES.filter((n) => !seen.includes(n.id)).length;
}
