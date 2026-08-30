'use client';

import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveGuildActivity } from '@/components/LiveGuildActivity';
import { Card } from '@/components/ui';
import { useIsLive } from '@/lib/tutorial';
import type { Role } from '@/lib/types';

// Directors manage Guild membership from their Church room. This shared board
// is deliberately limited to Guides and Explorers who belong to the Guild.
const MEMBERS: Role[] = ['dm', 'ds'];

function DemoGuilds() {
  return (
    <Card className="p-5">
      <h1 className="text-2xl font-extrabold text-navy">🧩 Guild Room</h1>
      <p className="mt-2 text-gray-600">
        Your Guild activity is available in your live church workspace. It keeps
        group participation separate from the sample tutorial data.
      </p>
    </Card>
  );
}

export default function GuildsPage() {
  if (useIsLive()) {
    return <LiveAppShell allow={MEMBERS}><LiveGuildActivity /></LiveAppShell>;
  }
  return <AppShell allow={MEMBERS}><DemoGuilds /></AppShell>;
}
