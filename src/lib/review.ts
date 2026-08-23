import * as SecureStore from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';

/**
 * Ask for an App Store rating, but only once and only after the app has earned
 * it.
 *
 * Apple caps the prompt at three showings a year and silently swallows the
 * rest, so a request spent on someone who has just arrived is a request that
 * cannot be spent later on someone who stayed. Publishing is the moment worth
 * asking after: the photo is saved, the haptic has fired, and the reader has
 * just got what they came for.
 */

const PUBLISH_COUNT_KEY = 'review.publishCount';
const ASKED_KEY = 'review.asked';

/** Publishes before asking. Enough to mean the app stuck, short enough to reach. */
const ASK_AFTER_PUBLISHES = 5;

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // A rating prompt is not worth surfacing a storage failure over.
  }
}

/**
 * Record a publish and, at the threshold, ask for a review.
 *
 * Never throws and never blocks the caller's flow — the post is already saved
 * by the time this runs, so nothing here may interfere with it.
 */
export async function notePublishedPost(): Promise<void> {
  try {
    if (await read(ASKED_KEY)) return;

    const count = Number.parseInt((await read(PUBLISH_COUNT_KEY)) ?? '0', 10);
    const next = Number.isFinite(count) ? count + 1 : 1;
    await write(PUBLISH_COUNT_KEY, String(next));
    if (next < ASK_AFTER_PUBLISHES) return;

    // False in TestFlight and on the web, where the prompt cannot appear. The
    // flag is set either way: a request iOS declines to show is still spent as
    // far as the reader is concerned, and re-asking every publish afterwards
    // would be the annoyance this is trying to avoid.
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;

    await write(ASKED_KEY, 'true');
    await StoreReview.requestReview();
  } catch {
    // Nothing about a rating is worth interrupting a successful publish.
  }
}
