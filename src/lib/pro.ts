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

export async function verifyProPurchase(purchase: Purchase): Promise<void> {
  if (purchase.productId !== PRO_PRODUCT_ID || !purchase.purchaseToken) {
    throw new Error('Butikken returnerte ikke en gyldig Pro-kvittering.');
  }
  const platform = purchase.store === 'apple' ? 'ios' : 'android';
  const { error } = await supabase.functions.invoke('verify-pro-purchase', {
    body: {
      platform,
      productId: purchase.productId,
      purchaseToken: purchase.purchaseToken,
    },
  });
  if (error) throw error;
}
