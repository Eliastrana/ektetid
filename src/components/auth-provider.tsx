import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

import type { Profile } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/** Usernames handed out by the signup trigger, before the user picks their own. */
export const PROVISIONAL_USERNAME_PREFIX = 'bruker_';

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  /** True until the stored session has been read back from the Keychain. */
  initializing: boolean;
  needsUsername: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth må brukes inni en AuthProvider.');
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data ?? null);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      void loadProfile(data.session?.user.id).finally(() => {
        if (active) setInitializing(false);
      });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void loadProfile(next?.user.id);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(
    () => loadProfile(session?.user.id),
    [loadProfile, session?.user.id]
  );

  return (
    <AuthContext
      value={{
        session,
        profile,
        initializing,
        needsUsername:
          !!session && !!profile && profile.username.startsWith(PROVISIONAL_USERNAME_PREFIX),
        refreshProfile,
      }}>
      {children}
    </AuthContext>
  );
}
