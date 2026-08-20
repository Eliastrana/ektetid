import type { Purchase } from 'expo-iap';

import { supabase } from '@/lib/supabase';

export const PRO_PRODUCT_ID = 'com.eliastrana.ektetid.pro';

export type ProProgress = {
  isPro: boolean;
  purchased: boolean;
  postCount: number;
  albumCount: number;
};

export async function fetchProProgress(userId: string): Promise<ProProgress> {
  const [posts, entitlement] = await Promise.all([
    supabase.from('posts').select('album_id').eq('author_id', userId),
    supabase.from('pro_entitlements').select('source').eq('user_id', userId).maybeSingle(),
  ]);
  if (posts.error) throw posts.error;
  if (entitlement.error) throw entitlement.error;

  const postCount = posts.data.length;
  const albumCount = new Set(posts.data.map((post) => post.album_id)).size;
  const purchased = entitlement.data?.source === 'purchase';
  return {
    postCount,
    albumCount,
    purchased,
    isPro: !!entitlement.data || (postCount >= 20 && albumCount >= 3),
  };
}

/**
 * Why the server refused a receipt. `null` means the call never got a verdict
 * (offline, timeout, function down), which is retryable; a reason means the
 * store's answer was final.
 */
export type ProFailureReason =
  | 'account_mismatch'
  | 'already_claimed'
  | 'invalid_receipt'
  | 'not_configured'
  | 'product_mismatch'
  | 'revoked';

export class ProPurchaseError extends Error {
  constructor(readonly reason: ProFailureReason | null) {
    super(reason ?? 'unreachable');
  }
}

/** Terminal reasons: retrying or re-buying cannot change the answer. */
export function isTerminal(reason: ProFailureReason | null): boolean {
  return (
    reason === 'account_mismatch' ||
    reason === 'already_claimed' ||
    reason === 'product_mismatch' ||
    reason === 'revoked'
  );
}

async function readFailureReason(error: unknown): Promise<ProFailureReason | null> {
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;
  try {
    const body = (await context.clone().json()) as { reason?: unknown };
    return typeof body.reason === 'string' ? (body.reason as ProFailureReason) : null;
  } catch {
    return null;
  }
}

export async function verifyProPurchase(purchase: Purchase): Promise<void> {
  if (purchase.productId !== PRO_PRODUCT_ID || !purchase.purchaseToken) {
    throw new ProPurchaseError('invalid_receipt');
  }
  const platform = purchase.store === 'apple' ? 'ios' : 'android';
  const { error } = await supabase.functions.invoke('verify-pro-purchase', {
    body: {
      platform,
      productId: purchase.productId,
      purchaseToken: purchase.purchaseToken,
    },
  });
  if (error) throw new ProPurchaseError(await readFailureReason(error));
}
