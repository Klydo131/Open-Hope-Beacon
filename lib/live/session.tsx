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
        const why = cause instanceof Error ? cause.message : '';
        // A DEAD SESSION IS NOT AN ERROR TO READ, IT IS A SIGN-IN SCREEN.
        //
        // This used to print "Your account is not ready. JWT expired." under a
        // Sign out button. Every word of that is wrong from where the person
        // is standing: their account is fine, they have no idea what a JWT is,
        // and the one action offered is the one they did not want. It happened
        // an hour after signing in, because nothing refreshed the token.
        //
        // The refresh in lib/supabase/client.ts is what stops it happening.
        // This is the floor underneath that: if a session really is finished,
        // say so by showing the front door, not by naming the mechanism.
        if (/jwt|expired|invalid|refresh token|not authenticated/i.test(why)) {
          live.signOut().catch(() => {});
          setSession(null);
          setProfile(null);
          setError('');
        } else {
          setProfile(null);
          setError(why || 'Could not load your account.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load(readBrowserSession());
    const syncAcrossTabs = () => void load(readBrowserSession());
    window.addEventListener('storage', syncAcrossTabs);

    // COMING BACK TO THE APP RE-CHECKS THE SESSION.
    //
    // A phone left overnight wakes with an access token hours past its expiry.
    // The first request would refresh it anyway, so this is not what keeps
    // somebody signed in -- it is what means the first thing they tap is not
    // the thing that pays for the refresh. Only when the tab becomes visible,
    // so a backgrounded app costs nothing.
    const recheck = () => {
      if (document.visibilityState === 'visible') void load(readBrowserSession());
    };
    document.addEventListener('visibilitychange', recheck);

    return () => {
      alive = false;
      window.removeEventListener('storage', syncAcrossTabs);
      document.removeEventListener('visibilitychange', recheck);
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
