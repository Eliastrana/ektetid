import { secureStorage } from '@/lib/secure-storage';

const KEY = 'ektetid.chrome_hiding';

/**
 * When the album's controls get out of the way.
 *
 * `manual` leaves them where they are. `auto` fades them out on its own after a
 * few idle seconds, which is what the app did for everyone before this was a
 * choice.
 */
export type ChromeHiding = 'auto' | 'manual';

/**
 * Manual by default.
 *
 * A timer deciding when the controls vanish is a guess about what someone is
 * doing — and it guesses wrong for the person reading a caption slowly, who
 * loses the text they were halfway through. The timer is still there for anyone
 * who prefers the photograph uncovered.
 */
const DEFAULT: ChromeHiding = 'manual';

/**
 * The last value read or written, so the album can start with the right one.
 *
 * The store is asynchronous and the album screen needs this on its first frame:
 * without a cache, every album would open in the default mode and switch a
 * moment later, which for the auto setting means controls that appear to hang
 * around and then abruptly agree to leave.
 */
let cached: ChromeHiding | null = null;

/** The current preference, or the default until one has been loaded. */
export function chromeHidingNow(): ChromeHiding {
  return cached ?? DEFAULT;
}

export async function loadChromeHiding(): Promise<ChromeHiding> {
  if (cached) return cached;
  try {
    const stored = await secureStorage.getItem(KEY);
    cached = stored === 'auto' ? 'auto' : DEFAULT;
  } catch {
    // A preference that cannot be read is not worth failing an album over.
    cached = DEFAULT;
  }
  return cached;
}

export async function setChromeHiding(value: ChromeHiding): Promise<void> {
  cached = value;
  await secureStorage.setItem(KEY, value);
}
