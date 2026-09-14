import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { secureStorage } from '@/lib/secure-storage';

const BUNDLE_ID = 'com.eliastrana.ektetid';

/** The version someone said "Ikke nå" to. A newer release asks again. */
const DISMISSED_KEY = 'ektetid.update-dismissed-version';

/** Long enough not to query Apple on every tab switch; short enough to notice a release the same day. */
const RECHECK_MS = 6 * 60 * 60 * 1000;

const LOOKUP_TIMEOUT_MS = 8000;

export type AvailableUpdate = {
  version: string;
  /** "Hva er nytt" from App Store Connect, as written there. */
  notes: string | null;
  /** Opens the App Store app directly. */
  storeUrl: string;
  /** The same page on the web, for when the scheme cannot be opened. */
  webUrl: string | null;
};

/** Numeric, segment by segment: 1.0.10 is newer than 1.0.9. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

type LookupResult = {
  version?: string;
  releaseNotes?: string;
  minimumOsVersion?: string;
  trackId?: number;
  trackViewUrl?: string;
};

/**
 * Ask the App Store what the current release is.
 *
 * Apple's public lookup, so nothing has to be kept in step on our side: the
 * version and notes are whatever was published in App Store Connect. iOS only —
 * Android is sideloaded with no store to send anyone to, and the web build is
 * always the latest by construction.
 */
async function lookup(): Promise<AvailableUpdate | null> {
  if (process.env.EXPO_OS !== 'ios') return null;

  const installed = Constants.expoConfig?.version;
  if (!installed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}&country=no`,
      { signal: controller.signal }
    );
    if (!response.ok) return null;

    const body = (await response.json()) as { results?: LookupResult[] };
    const latest = body.results?.[0];
    if (!latest?.version || !latest.trackId) return null;
    if (compareVersions(latest.version, installed) <= 0) return null;

    // Telling someone to update to a release their phone cannot install is
    // worse than saying nothing.
    if (
      latest.minimumOsVersion &&
      compareVersions(String(Platform.Version), latest.minimumOsVersion) < 0
    ) {
      return null;
    }

    return {
      version: latest.version,
      notes: latest.releaseNotes?.trim() || null,
      storeUrl: `itms-apps://apps.apple.com/app/id${latest.trackId}`,
      webUrl: latest.trackViewUrl ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

let cached: { at: number; result: Promise<AvailableUpdate | null> } | null = null;

/** A newer App Store release, or null. Failures are silent: this is a nudge. */
export function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!cached || Date.now() - cached.at > RECHECK_MS) {
    const result = lookup().catch(() => {
      // Offline or Apple slow: try again next time rather than in six hours.
      cached = null;
      return null;
    });
    cached = { at: Date.now(), result };
  }
  return cached.result;
}

export async function isUpdateDismissed(version: string): Promise<boolean> {
  try {
    return (await secureStorage.getItem(DISMISSED_KEY)) === version;
  } catch {
    return false;
  }
}

export async function dismissUpdate(version: string): Promise<void> {
  try {
    await secureStorage.setItem(DISMISSED_KEY, version);
  } catch {
    // Worst case the card returns next launch; not worth surfacing.
  }
}
