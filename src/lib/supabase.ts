import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import type { Database } from '@/lib/database.types';
import { secureStorage } from '@/lib/secure-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Mangler EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Kopier .env.example til .env.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There is no redirect URL to parse on native; leaving this on makes the
    // client wait for a browser callback that never arrives.
    detectSessionInUrl: false,
    // Required for the Google browser flow: the app exchanges a one-time code
    // rather than receiving tokens in the redirect.
    flowType: 'pkce',
  },
});

// Supabase only refreshes tokens while the app is awake. Without this, a
// session can expire in the background and the first query after resuming
// fails with a 401.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
