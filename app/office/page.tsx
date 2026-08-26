'use client';

// The office: where the work is done, as opposed to where the people are.
//
// WHY THIS ROOM EXISTS. The tools were scattered through the screens that are
// about people. A Guide's roster carried study-writing, library-stocking and a
// blog desk under the list of the five people they walk with; a Director's
// analytics and export lived inside one tab of the admin screen, three clicks
// from anywhere. So the screens about people were long, and the tools were hard
// to find, and both problems have the same fix.
//
// The split is by KIND OF WORK, not by permission:
//
//   * a roster, a conversation, a case  -> about a person, on their own screen
//   * numbers, exports, writing, stocking a shelf -> office work, in here
//
// Explorers do not have this room. Not because anything is hidden from them,
// but because none of it is theirs to do: an Explorer has no roster to report
// on, no shelf to stock and nobody to write studies for. A room that would be
// empty for them is a room that tells them they are missing something.
//
// NOTHING NEW IS BUILT HERE. Every panel already existed and already carries
// its own permissions, in the database rather than in this file. Moving a card
// cannot grant anybody anything, which is the point of putting the rules where
// they are.

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { useLiveSession } from '@/lib/live/session';
import { useIsLive } from '@/lib/tutorial';
import * as live from '@/lib/live/data';
import { Card } from '@/components/ui';
import { LiveAnalytics } from '@/components/LiveAnalytics';
import { LiveExport } from '@/components/LiveExport';
import { LiveBoardReport } from '@/components/LiveExecutive';
import { LiveStudies } from '@/components/LiveStudies';
import { LiveLibraryForGuide } from '@/components/LiveLibrary';
import { LiveBlogDesk } from '@/components/LiveBlog';
import { LiveRecommend } from '@/components/LiveMinistry';
import { Analytics } from '@/components/DemoAnalytics';
import { LessonSeriesLibrary } from '@/components/LessonSeriesLibrary';
import type { Role } from '@/lib/types';

// Guides and leadership. Explorers are sent home by the shell.
const WORKERS: Role[] = ['executive', 'admin', 'dm'];

function Heading({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <h1 className="text-3xl font-extrabold text-room">🗂️ Office</h1>
      <p className="mt-1 text-room-soft">{subtitle}</p>
    </div>
  );
}

function LiveOffice() {
  const { profile } = useLiveSession();
  const [churchName, setChurchName] = useState<string>();
  const [pairings, setPairings] = useState<{ id: string; ds_name: string }[]>([]);

  useEffect(() => {
    live.myChurch().then((c) => setChurchName(c?.name ?? undefined)).catch(() => {});
  }, []);

  const isGuide = profile?.role === 'dm';
  useEffect(() => {
    if (!isGuide) return;
    let alive = true;
    live.listPairings()
      .then((rows) => {
        if (!alive) return;
        setPairings(rows.filter((r) => r.status === 'active')
          .map((r) => ({ id: r.id, ds_name: r.ds_name })));
      })
      // The shelf still works without the share buttons, so a failed lookup
      // must not take the whole room down.
      .catch(() => {});
    return () => { alive = false; };
  }, [isGuide]);

  if (!profile) return null;
  const leads = profile.role === 'admin' || profile.role === 'executive';

  return (
    <div className="space-y-5">
      <Heading
        subtitle={
          leads
            ? 'The numbers, the files you can take away, and the things you write.'
            : 'Your numbers, the studies you write, and the shelf you stock.'
        }
      />

      {/* THE NUMBERS FIRST. They are the reason somebody opens this room on a
          Tuesday morning, and everything below is a thing you do rather than a
          thing you read. */}
      <LiveAnalytics churchName={churchName} />

      {leads && <LiveBoardReport churchName={churchName} />}
      {leads && <LiveExport churchName={churchName} />}

      {/* WRITING AND STOCKING, for everyone who has this room. A Guide writing
          a study and a Director writing one are the same act, and the database
          has said so since migration 0038. Passing the Guide's own pairings
          gives them the share-with-one-person buttons; leadership gets
          add-and-publish, which is right: stocking the shelf is a Director's
          job, handing a book to one person is a Guide's. */}
      <LiveStudies canWrite />
      <LiveLibraryForGuide pairings={pairings} />

      {/* Recommending somebody for a role is office work too, and it was only
          on the Guide's roster before. */}
      {isGuide && <LiveRecommend />}

      <LiveBlogDesk />
    </div>
  );
}

/**
 * The tutorial's office, with the tutorial's own tools in it.
 *
 * PARITY IS THE POINT. Somebody who learns the job in the demo and then signs
 * in should find the same rooms in the same places. A demo that says "this
 * exists but not here" teaches the shape of the app wrong, and every complaint
 * this session has ultimately been that gap.
 *
 * The numbers are the demo's invented ones, which the tutorial banner says on
 * every screen, and the practice is in reading the room rather than the figures.
 */
function DemoOffice() {
  return (
    <div className="space-y-5">
      <Heading subtitle="The numbers, and the shelf you stock. Sample data." />
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">📈 How the church is going</h2>
        <p className="mt-1 text-sm text-gray-500">
          Invented numbers, for practice. The live office shows your own.
        </p>
        <div className="mt-4">
          <Analytics />
        </div>
      </Card>
      <LessonSeriesLibrary />
    </div>
  );
}

export default function OfficePage() {
  if (useIsLive()) {
    return <LiveAppShell allow={WORKERS}><LiveOffice /></LiveAppShell>;
  }
  return <AppShell allow={WORKERS}><DemoOffice /></AppShell>;
}
