/**
 * Verify a non-consumable Pro purchase with the platform before granting it.
 *
 * Required production secrets:
 * - APPLE_APP_ID (numeric App Store app id; Apple only)
 * - GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (Play Console service account; Android only)
 *
 * The Apple JWS is checked against Apple's root certificates and bound to both
 * this bundle and the authenticated Supabase UUID supplied as appAccountToken.
 * Android is checked through the Google Play Developer API and the same UUID is
 * required as obfuscatedExternalAccountId. A store transaction can therefore
 * neither be forged by the client nor replayed onto another EkteTid account.
 */

import {
  Environment,
  SignedDataVerifier,
} from 'npm:@apple/app-store-server-library@3';
import { GoogleAuth } from 'npm:google-auth-library@10';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PRODUCT_ID = 'com.eliastrana.ektetid.pro';
const BUNDLE_ID = 'com.eliastrana.ektetid';
const ANDROID_PACKAGE = 'com.eliastrana.ektetid';

type RequestBody = {
  platform?: 'ios' | 'android';
  productId?: string;
  purchaseToken?: string;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authHeader || !url || !anonKey || !serviceKey) {
    return json({ error: 'Function is not configured' }, 500);
  }

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await caller.auth.getUser();
  const user = userData.user;
  if (!user) return json({ error: 'Not signed in' }, 401);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (
    body.productId !== PRODUCT_ID ||
    !body.purchaseToken ||
    (body.platform !== 'ios' && body.platform !== 'android')
  ) {
    return json({ error: 'Invalid purchase' }, 400);
  }

  try {
    const transactionId =
      body.platform === 'ios'
        ? await verifyApple(body.purchaseToken, user.id)
        : await verifyGoogle(body.purchaseToken, user.id);

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.from('pro_entitlements').upsert(
      {
        user_id: user.id,
        source: 'purchase',
        transaction_id: transactionId,
      },
      { onConflict: 'user_id' }
    );
    if (error) return json({ error: 'Purchase already belongs to another account' }, 409);

    return json({ pro: true });
  } catch (error) {
    console.error('Purchase verification failed', error);
    return json({ error: 'Purchase could not be verified' }, 400);
  }
});

async function verifyApple(jws: string, userId: string): Promise<string> {
  const unsigned = decodeJwsPayload(jws);
  const production = unsigned.environment === 'Production';
  const environment = production ? Environment.PRODUCTION : Environment.SANDBOX;
  const appAppleId = production ? Number(Deno.env.get('APPLE_APP_ID')) : undefined;
  if (production && !Number.isFinite(appAppleId)) {
    throw new Error('APPLE_APP_ID is missing');
  }

  const roots = await Promise.all(
    ['AppleRootCA-G2.cer', 'AppleRootCA-G3.cer'].map(async (filename) =>
      Buffer.from(await Deno.readFile(new URL(filename, import.meta.url)))
    )
  );
  const verifier = new SignedDataVerifier(
    roots,
    true,
    environment,
    BUNDLE_ID,
    appAppleId
  );
  const transaction = await verifier.verifyAndDecodeTransaction(jws);

  if (
    transaction.productId !== PRODUCT_ID ||
    transaction.bundleId !== BUNDLE_ID ||
    transaction.appAccountToken !== userId ||
    transaction.revocationDate
  ) {
    throw new Error('Apple transaction does not match the account');
  }
  if (!transaction.transactionId) throw new Error('Missing transaction id');
  return `apple:${transaction.transactionId}`;
}

function decodeJwsPayload(jws: string): Record<string, unknown> {
  const encoded = jws.split('.')[1];
  if (!encoded) throw new Error('Malformed JWS');
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
}

type GooglePurchase = {
  acknowledgementState?: number;
  obfuscatedExternalAccountId?: string;
  orderId?: string;
  purchaseState?: number;
};

async function verifyGoogle(token: string, userId: string): Promise<string> {
  const rawCredentials = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!rawCredentials) throw new Error('Google Play credentials are missing');

  const auth = new GoogleAuth({
    credentials: JSON.parse(rawCredentials),
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const client = await auth.getClient();
  const endpoint =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE}` +
    `/purchases/products/${PRODUCT_ID}/tokens/${encodeURIComponent(token)}`;
  const response = await client.request<GooglePurchase>({ url: endpoint });
  const purchase = response.data;

  if (purchase.purchaseState !== 0 || purchase.obfuscatedExternalAccountId !== userId) {
    throw new Error('Google transaction does not match the account');
  }
  return `google:${purchase.orderId ?? token}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
