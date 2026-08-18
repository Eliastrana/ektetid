import type { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
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
  onboardingComplete: boolean;
  completeOnboarding: () => Promise<void>;
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
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  const loadOnboarding = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setOnboardingComplete(false);
      return;
    }
    const stored = await SecureStore.getItemAsync(onboardingStorageKey(userId));
    setOnboardingComplete(stored === 'done');
  }, []);

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

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await Promise.all([
        loadProfile(data.session?.user.id),
        loadOnboarding(data.session?.user.id),
      ]).finally(() => {
        if (active) setInitializing(false);
      });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setInitializing(true);
      void Promise.all([loadProfile(next?.user.id), loadOnboarding(next?.user.id)]).finally(() => {
        if (active) setInitializing(false);
      });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadOnboarding, loadProfile]);

  const refreshProfile = useCallback(
    () => loadProfile(session?.user.id),
    [loadProfile, session?.user.id]
  );

  const completeOnboarding = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) return;
    await SecureStore.setItemAsync(onboardingStorageKey(userId), 'done');
    setOnboardingComplete(true);
  }, [session?.user.id]);

  return (
    <AuthContext
      value={{
        session,
        profile,
        initializing,
        needsUsername:
          !!session && !!profile && profile.username.startsWith(PROVISIONAL_USERNAME_PREFIX),
        onboardingComplete,
        completeOnboarding,
        refreshProfile,
      }}>
      {children}
    </AuthContext>
  );
}
function onboardingStorageKey(userId: string) {
  return `ektetid.onboarding.v1.${userId}`;
}
