'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Role } from './types';

// -------------------------------------------------------------------------
// "My room" — per-person, per-device room personalisation.
//
// The design brief: a Digital Seeker's room is a PRIVATE STUDY, not a feed.
// Nothing here is shared, broadcast, or visible to anyone else — choosing a
// theme is like moving the lamp on your own desk. Staff roles (admin,
// missionary) get the same control, but their palettes read as an OFFICE:
// they have a job to do and people to reach, so their room is a workplace,
// not a retreat.
//
// Everything is stored on the device in localStorage. No server, no cost, and
// the choice follows the person on the machine they made it on.
// -------------------------------------------------------------------------

export interface RoomTheme {
  key: string;
  label: string;
  blurb: string;
  /** Page background — a soft wash behind the whole workspace. */
  bg: string;
  /** Rail / panel surface colour. */
  panel: string;
  /** Text colour that sits on `panel`. */
  ink: string;
  /** Muted text on `panel`. */
  inkSoft: string;
  /** Hairline borders on `panel`. */
  line: string;
  /** The room's accent. */
  accent: string;
}

// A seeker's study. Quiet, warm, personal.
export const STUDY_THEMES: RoomTheme[] = [
  {
    key: 'paper',
    label: 'Quiet Study',
    blurb: 'Warm paper and soft light',
    bg: 'linear-gradient(180deg, #FBF7F0 0%, #F4EEE4 100%)',
    panel: '#FFFDF9',
    ink: '#3A322A',
    inkSoft: '#8A7E70',
    line: 'rgba(58,50,42,0.10)',
    accent: '#C08A3E',
  },
  {
    key: 'morning',
    label: 'Morning Light',
    blurb: 'Early sun through the window',
    bg: 'linear-gradient(180deg, #FFF9EC 0%, #FDF0D8 100%)',
    panel: '#FFFFFF',
    ink: '#4A3B1F',
    inkSoft: '#9B8759',
    line: 'rgba(74,59,31,0.10)',
    accent: '#E8B84B',
  },
  {
    key: 'garden',
    label: 'Garden',
    blurb: 'Green and growing',
    bg: 'linear-gradient(180deg, #F2F8EF 0%, #E4F0DE 100%)',
    panel: '#FFFFFF',
    ink: '#28402A',
    inkSoft: '#6E8770',
    line: 'rgba(40,64,42,0.10)',
    accent: '#7FB03A',
  },
  {
    key: 'chapel',
    label: 'Chapel',
    blurb: 'Still, deep and reverent',
    bg: 'linear-gradient(180deg, #1B2340 0%, #141A2E 100%)',
    panel: '#232C4C',
    ink: '#EDEFF7',
    inkSoft: '#9AA3C2',
    line: 'rgba(255,255,255,0.10)',
    accent: '#E8B84B',
  },
  {
    key: 'lamplight',
    label: 'Lamplight',
    blurb: 'Late study, low light',
    bg: 'linear-gradient(180deg, #241E1A 0%, #1A1614 100%)',
    panel: '#2E2723',
    ink: '#F2EBE3',
    inkSoft: '#A89A8B',
    line: 'rgba(255,255,255,0.10)',
    accent: '#D9944A',
  },
];

// Staff. A desk, a door, and work waiting on it.
export const OFFICE_THEMES: RoomTheme[] = [
  {
    key: 'desk',
    label: 'The Desk',
    blurb: 'Clean, bright, ready for work',
    bg: 'linear-gradient(180deg, #F5F7FB 0%, #EBEFF7 100%)',
    panel: '#FFFFFF',
    ink: '#1E2A4A',
    inkSoft: '#6B7695',
    line: 'rgba(30,42,74,0.10)',
    accent: '#1E2A4A',
  },
  {
    key: 'slate',
    label: 'Slate',
    blurb: 'Cool and focused',
    bg: 'linear-gradient(180deg, #171C28 0%, #10141C 100%)',
    panel: '#212736',
    ink: '#E8ECF5',
    inkSoft: '#9099AF',
    line: 'rgba(255,255,255,0.10)',
    accent: '#5B8DEF',
  },
  {
    key: 'study',
    label: 'Warm Office',
    blurb: 'Wood, brass and quiet',
    bg: 'linear-gradient(180deg, #F8F3EA 0%, #EFE6D6 100%)',
    panel: '#FFFCF6',
    ink: '#3B3125',
    inkSoft: '#8B7C66',
    line: 'rgba(59,49,37,0.10)',
    accent: '#A87B3C',
  },
  {
    key: 'focus',
    label: 'Focus',
    blurb: 'Nothing but the task',
    bg: 'linear-gradient(180deg, #FAFAFA 0%, #F0F0F0 100%)',
    panel: '#FFFFFF',
    ink: '#222222',
    inkSoft: '#777777',
    line: 'rgba(0,0,0,0.10)',
    accent: '#444444',
  },
];

export function themesFor(role: Role): RoomTheme[] {
  return role === 'ds' ? STUDY_THEMES : OFFICE_THEMES;
}

export function isSeekerRole(role: Role): boolean {
  return role === 'ds';
}

const KEY = 'beacon-room-v1';

export interface RoomPrefs {
  theme: string;
  /** Show the left workspace rail on wide screens. */
  leftRail: boolean;
  /** Show the right room panel on wide screens. */
  rightRail: boolean;
  /** A line the person writes for themselves — their room, their words. */
  motto: string;
}

function defaultsFor(role: Role): RoomPrefs {
  return {
    theme: themesFor(role)[0].key,
    leftRail: true,
    rightRail: true,
    motto: '',
  };
}

// Prefs are keyed per person so two people sharing a laptop keep their own room.
function storeKey(userId: string) {
  return `${KEY}:${userId}`;
}

function load(userId: string, role: Role): RoomPrefs {
  const base = defaultsFor(role);
  if (typeof window === 'undefined') return base;
  try {
    const raw = localStorage.getItem(storeKey(userId));
    if (!raw) return base;
    const p = JSON.parse(raw);
    const valid = themesFor(role).some((t) => t.key === p.theme);
    return {
      theme: valid ? p.theme : base.theme,
      leftRail: typeof p.leftRail === 'boolean' ? p.leftRail : true,
      rightRail: typeof p.rightRail === 'boolean' ? p.rightRail : true,
      motto: typeof p.motto === 'string' ? p.motto.slice(0, 80) : '',
    };
  } catch {
    return base;
  }
}

export function useRoom(userId: string | null, role: Role) {
  const [prefs, setPrefs] = useState<RoomPrefs>(() => defaultsFor(role));

  useEffect(() => {
    if (userId) setPrefs(load(userId, role));
  }, [userId, role]);

  const update = useCallback(
    (patch: Partial<RoomPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        if (userId) {
          try {
            localStorage.setItem(storeKey(userId), JSON.stringify(next));
          } catch {}
        }
        return next;
      });
    },
    [userId],
  );

  const list = themesFor(role);
  const theme = list.find((t) => t.key === prefs.theme) ?? list[0];

  return { prefs, update, theme, themes: list };
}
