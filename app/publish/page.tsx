'use client';

// Publish: the room where you write things other people will read.
//
// WHY IT IS ITS OWN ROOM, AND WHY EVERY ROLE HAS IT.
//
// Writing was scattered across the screens people READ. The blog desk sat on an
// Explorer's journey, on a Guide's Office and inside a Director's admin tab;
// the announcement composer sat on top of the church home screen, which is the
// page somebody opens to find out what the church has said. So the reading
// screens carried a writer's furniture, and somebody who wanted to write had to
// remember which of their screens happened to hold the box.
//
// Publishing is a task. A task gets a room.
//
// EVERY ROLE HAS THE ROOM, and the room is not the same for everybody. An
// Explorer can write a blog post, which the whole church reads; they cannot pin
// an announcement, because a notice sits above everybody's church screen and
// that is an act of leading rather than of speaking. Rather than hide the panel
// from them and leave a gap, the screen says which is which and points them at
// the thing they can do. A room that is blank for a whole role reads as broken.
//
// NOTHING HERE DECIDES WHO MAY DO WHAT. Both panels carry their own rules, in
// the database. Moving a card between screens cannot grant anybody anything,
// which is the point of putting the rules where they are.

import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveBlogDesk } from '@/components/LiveBlog';
import { LiveWriteNotice } from '@/components/LiveWriteNotice';
import { BlogDesk } from '@/components/Blog';
import { useDemo } from '@/lib/demo/store';
import { useIsLive } from '@/lib/tutorial';
import { Card } from '@/components/ui';
import type { Role } from '@/lib/types';

const ALL: Role[] = ['executive', 'admin', 'dm', 'ds'];

function Heading() {
  return (
    <div>
      <h1 className="text-3xl font-extrabold text-room">✍️ Publish</h1>
      <p className="mt-1 text-room-soft">
        Everything you write for other people to read, in one place.
      </p>
    </div>
  );
}

function Live() {
  return (
    <div className="space-y-5">
      <Heading />
      {/* THE BLOG FIRST, because everybody has one. The announcement panel
          below either lets you write one or explains why it does not. */}
      <LiveBlogDesk />
      <LiveWriteNotice />
    </div>
  );
}

function Demo() {
  const { currentUser } = useDemo();
  if (!currentUser) return null;
  return (
    <div className="space-y-5">
      <Heading />
      {/* The tutorial has a blog desk for a Guide and nothing for the others,
          so the room says so rather than drawing an empty screen. */}
      {currentUser.role === 'dm' ? (
        <BlogDesk userId={currentUser.id} />
      ) : (
        <Card className="p-6 text-center">
          <p className="text-lg font-bold text-navy">Practise as a Guide</p>
          <p className="mt-1 text-sm text-gray-500">
            The tutorial only carries a blog for the sample Guide. On the live
            app everybody has one here, and Guides and Directors can pin an
            announcement as well.
          </p>
        </Card>
      )}
    </div>
  );
}

export default function PublishPage() {
  if (useIsLive()) {
    return <LiveAppShell allow={ALL}><Live /></LiveAppShell>;
  }
  return <AppShell allow={ALL}><Demo /></AppShell>;
}
