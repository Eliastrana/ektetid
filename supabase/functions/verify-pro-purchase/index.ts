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
import { Buffer } from 'node:buffer';

const PRODUCT_ID = 'com.eliastrana.ektetid.pro';
const BUNDLE_ID = 'com.eliastrana.ektetid';
const ANDROID_PACKAGE = 'com.eliastrana.ektetid';

/**
 * Apple's root certificates, as base64 DER.
 *
 * These are inlined rather than read from disk on purpose: Supabase uploads
 * only a function's module graph, so a sibling .cer is silently dropped at
 * deploy time and every verification then fails at runtime. Both roots are
 * public and valid until 2039.
 */
const APPLE_ROOT_CAS = [
  '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' +
  'F+E=',
  'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBw' +
  'bGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhv' +
  'cml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgx' +
  'OTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMx' +
  'JjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApB' +
  'cHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1A' +
  'cqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBP' +
  'EVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0O' +
  'BBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/' +
  'BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHF' +
  'D/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2Qf' +
  'yFMm+YhidDkLF1vLUagM6BgD56KyKA==',
];

/**
 * Why a verification failed. Safe to hand back to the client: it says which
 * check rejected the receipt, never anything that would help forge one. The
 * app needs this to tell a retryable failure from a terminal one.
 */
type FailureReason =
  | 'account_mismatch'
  | 'already_claimed'
  | 'invalid_receipt'
  | 'not_configured'
  | 'product_mismatch'
  | 'revoked';

class VerificationError extends Error {
  constructor(readonly reason: FailureReason, message: string) {
    super(message);
  }
}

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
    if (error) {
      return json(
        { error: 'Purchase already belongs to another account', reason: 'already_claimed' },
        409
      );
    }

    return json({ pro: true });
  } catch (error) {
    console.error('Purchase verification failed', error);
    const reason: FailureReason =
      error instanceof VerificationError ? error.reason : 'invalid_receipt';
    return json({ error: 'Purchase could not be verified', reason }, 400);
  }
});

async function verifyApple(jws: string, userId: string): Promise<string> {
  const unsigned = decodeJwsPayload(jws);
  const production = unsigned.environment === 'Production';
  const environment = production ? Environment.PRODUCTION : Environment.SANDBOX;
  const appAppleId = production ? Number(Deno.env.get('APPLE_APP_ID')) : undefined;
  if (production && !Number.isFinite(appAppleId)) {
    throw new VerificationError('not_configured', 'APPLE_APP_ID is missing');
  }

  const roots = APPLE_ROOT_CAS.map((cert) => Buffer.from(cert, 'base64'));
  const verifier = new SignedDataVerifier(
    roots,
    true,
    environment,
    BUNDLE_ID,
    appAppleId
  );
  let transaction;
  try {
    transaction = await verifier.verifyAndDecodeTransaction(jws);
  } catch (error) {
    throw new VerificationError('invalid_receipt', `Apple rejected the receipt: ${error}`);
  }

  if (transaction.productId !== PRODUCT_ID || transaction.bundleId !== BUNDLE_ID) {
    throw new VerificationError('product_mismatch', 'Receipt is for a different product');
  }
  if (transaction.revocationDate) {
    throw new VerificationError('revoked', 'Apple revoked this purchase');
  }
  // Apple lower-cases the token it echoes back; Postgres UUIDs are already
  // lower-case, but compare defensively so casing can never reject a valid buyer.
  if (transaction.appAccountToken?.toLowerCase() !== userId.toLowerCase()) {
    throw new VerificationError(
      'account_mismatch',
      'Receipt was bought by a different EkteTid account'
    );
  }
  if (!transaction.transactionId) {
    throw new VerificationError('invalid_receipt', 'Missing transaction id');
  }
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
  if (!rawCredentials) {
    throw new VerificationError('not_configured', 'Google Play credentials are missing');
  }

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

  if (purchase.purchaseState !== 0) {
    throw new VerificationError('invalid_receipt', 'Google purchase is not complete');
  }
  if (purchase.obfuscatedExternalAccountId?.toLowerCase() !== userId.toLowerCase()) {
    throw new VerificationError(
      'account_mismatch',
      'Purchase was bought by a different EkteTid account'
    );
  }
  return `google:${purchase.orderId ?? token}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
