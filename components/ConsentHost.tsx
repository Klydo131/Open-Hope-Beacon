'use client';

import { useDemo } from '@/lib/demo/store';
import { ConsentNotice } from './ConsentNotice';

// Shows the privacy notice to a Digital Seeker who hasn't accepted it yet.
// Only seekers see it — they're the people whose faith journey the notice is
// about. Staff roles (admin, DM) are not interrupted.
export function ConsentHost() {
  const { currentUser } = useDemo();
  if (!currentUser) return null;
  if (currentUser.role !== 'ds') return null;
  if (currentUser.consent_at) return null;
  return <ConsentNotice />;
}
