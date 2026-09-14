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
  constructor(
    readonly reason: ProFailureReason | null,
    readonly status: number | null = null
  ) {
    super(reason ?? `http:${status ?? 'unreachable'}`);
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

type ResponseLike = {
  status?: number;
  clone?: () => ResponseLike;
  json?: () => Promise<unknown>;
};

/**
 * Pull the server's verdict out of a functions.invoke failure.
 *
 * The response is duck-typed rather than tested with `instanceof Response`:
 * under Hermes the fetch polyfill's Response is not dependably the same
 * constructor the app holds, and a false negative would throw away the reason
 * and report every refusal as a network problem. The status is kept either way
 * so a reasonless failure can still say something concrete.
 */
async function readFailure(
  error: unknown
): Promise<{ reason: ProFailureReason | null; status: number | null }> {
  const context = (error as { context?: ResponseLike }).context;
  const status = typeof context?.status === 'number' ? context.status : null;
  if (typeof context?.json !== 'function') return { reason: null, status };
  try {
    const source = typeof context.clone === 'function' ? context.clone() : context;
    const body = (await source.json?.()) as { reason?: unknown } | undefined;
    const reason = body?.reason;
    return {
      reason: typeof reason === 'string' ? (reason as ProFailureReason) : null,
      status,
    };
  } catch {
    return { reason: null, status };
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
  if (error) {
    const { reason, status } = await readFailure(error);
    throw new ProPurchaseError(reason, status);
  }
}
