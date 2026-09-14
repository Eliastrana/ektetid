/**
 * The web build's session store.
 *
 * SecureStore is the Keychain and the Keystore; neither exists in a browser,
 * and expo-secure-store's web build throws rather than degrading. localStorage
 * is what every web Supabase app uses, and it needs none of the chunking the
 * native adapter does — that exists only because SecureStore rejects values
 * over about 2KB, and localStorage will hold megabytes.
 *
 * Every method tolerates `window` being absent. Static rendering runs this
 * module under Node to prerender the HTML, and auth-js reads storage while
 * initialising, so an unguarded `localStorage` would crash the build rather
 * than the page. Returning null there is correct anyway: a server prerender
 * has nobody signed in, and the real session is read once the page hydrates.
 */

const available = () => typeof window !== 'undefined' && !!window.localStorage;

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!available()) return null;
    return window.localStorage.getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!available()) return;
    window.localStorage.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (!available()) return;
    window.localStorage.removeItem(key);
  },
};
