'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { readBrowserSession } from '@/lib/supabase/client';
import * as live from '@/lib/live/data';
import type { Profile, Role } from '@/lib/types';

const HOME: Record<Role, string> = {
  executive: '/admin',
  admin: '/admin',
  dm: '/dm',
  ds: '/ds',
};

export const homeFor = (role: Role) => HOME[role];

interface LiveSessionValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string;
  refreshProfile: () => Promise<Profile | null>;
  signOut: () => Promise<void>;
}

const LiveSessionContext = createContext<LiveSessionValue | null>(null);

export function LiveSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshProfile = useCallback(async () => {
    const nextSession = readBrowserSession();
    if (!nextSession) {
      setSession(null);
      setProfile(null);
      return null;
    }
    setSession(nextSession);
    const next = await live.getMyProfile();
    setProfile(next);
    return next;
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async (next: Session | null) => {
      if (!alive) return;
      setSession(next);
      if (!next) {
        setProfile(null);
        setError('');
        setLoading(false);
        return;
      }
      try {
        const mine = await live.getMyProfile();
        if (!alive) return;
        setProfile(mine);
        setError(mine ? '' : 'Your account profile is not ready yet.');
      } catch (cause) {
        if (!alive) return;
        setProfile(null);
        setError(cause instanceof Error ? cause.message : 'Could not load your account.');
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load(readBrowserSession());
    const syncAcrossTabs = () => void load(readBrowserSession());
    window.addEventListener('storage', syncAcrossTabs);

    return () => {
      alive = false;
      window.removeEventListener('storage', syncAcrossTabs);
    };
  }, []);

  const signOut = useCallback(async () => {
    await live.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({ session, profile, loading, error, refreshProfile, signOut }),
    [session, profile, loading, error, refreshProfile, signOut],
  );

  return <LiveSessionContext.Provider value={value}>{children}</LiveSessionContext.Provider>;
}

export function useLiveSession(): LiveSessionValue {
  const value = useContext(LiveSessionContext);
  if (!value) throw new Error('useLiveSession must be used inside <LiveSessionProvider>.');
  return value;
}
