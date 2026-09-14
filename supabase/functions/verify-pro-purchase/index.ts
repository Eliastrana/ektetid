/**
 * Verify a non-consumable Pro purchase with the platform before granting it.
 *
 * Required production secrets:
 * - APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY
 *   (App Store Connect In-App Purchase key; Apple only)
 * - GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (Play Console service account; Android only)
 *
 * Apple receipts are confirmed by asking the App Store Server API about the
 * transaction id directly, rather than validating the device's JWS locally.
 * Apple's own verification library cannot run here: it needs X509Certificate's
 * `verify`, `raw` and `toString`, none of which this runtime implements, so
 * chain validation always threw before a signature was ever checked. Asking
 * Apple is at least as strong — the answer arrives over TLS from an endpoint we
 * authenticate to with a private key, so a client cannot forge or replay one.
 *
 * A purchase is owned by the store account that made it, and grants Pro to
 * whichever EkteTid account claims it — Apple cannot sell the same
 * non-consumable twice, so binding it to the account that happened to be signed
 * in at purchase time stranded anyone who later switched. Claiming moves the
 * entitlement rather than copying it, so one purchase is always one Pro.
 */

import { GoogleAuth } from 'npm:google-auth-library@10';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PRODUCT_ID = 'com.eliastrana.ektetid.pro';
const BUNDLE_ID = 'com.eliastrana.ektetid';
const ANDROID_PACKAGE = 'com.eliastrana.ektetid';

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
        ? await verifyApple(body.purchaseToken)
        : await verifyGoogle(body.purchaseToken);

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // Moves the entitlement off any account that held it before, so one
    // purchase keeps granting exactly one Pro.
    const { error } = await admin.rpc('claim_pro_entitlement', {
      p_user_id: user.id,
      p_transaction_id: transactionId,
    });
    if (error) {
      console.error('Could not record the entitlement', error);
      return json({ error: 'Could not record the purchase', reason: 'already_claimed' }, 409);
    }

    return json({ pro: true });
  } catch (error) {
    console.error('Purchase verification failed', error);
    const reason: FailureReason =
      error instanceof VerificationError ? error.reason : 'invalid_receipt';
    return json({ error: 'Purchase could not be verified', reason }, 400);
  }
});

/** Apple's transaction lookup, production first — sandbox powers TestFlight. */
const APPLE_HOSTS = [
  'https://api.storekit.itunes.apple.com',
  'https://api.storekit-sandbox.itunes.apple.com',
];

/**
 * Sign the ES256 assertion the App Store Server API authenticates us with.
 * WebCrypto covers this natively, which is the whole reason this path works
 * here when the certificate-chain one does not.
 */
async function appleApiToken(): Promise<string> {
  const keyId = Deno.env.get('APPLE_IAP_KEY_ID');
  const issuerId = Deno.env.get('APPLE_IAP_ISSUER_ID');
  const privateKey = Deno.env.get('APPLE_IAP_PRIVATE_KEY');
  if (!keyId || !issuerId || !privateKey) {
    throw new VerificationError('not_configured', 'App Store Connect key is missing');
  }

  const pkcs8 = Uint8Array.from(
    atob(privateKey.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')),
    (character) => character.charCodeAt(0)
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })));
  const claims = base64Url(
    encoder.encode(
      JSON.stringify({
        iss: issuerId,
        iat: now,
        exp: now + 600,
        aud: 'appstoreconnect-v1',
        bid: BUNDLE_ID,
      })
    )
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      encoder.encode(`${header}.${claims}`)
    )
  );
  return `${header}.${claims}.${base64Url(signature)}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verifyApple(jws: string): Promise<string> {
  // The device's JWS is read only to learn which transaction to ask about. None
  // of it is trusted: every field checked below comes back from Apple.
  const claimed = decodeJwsPayload(jws);
  const transactionId = claimed.transactionId;
  if (typeof transactionId !== 'string' || !transactionId) {
    throw new VerificationError('invalid_receipt', 'Receipt carries no transaction id');
  }

  const token = await appleApiToken();
  let signedTransaction: string | undefined;
  let notFound = false;

  for (const host of APPLE_HOSTS) {
    const response = await fetch(
      `${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (response.status === 404) {
      notFound = true;
      continue;
    }
    if (!response.ok) {
      throw new VerificationError(
        'invalid_receipt',
        `App Store Server API returned ${response.status}: ${await response.text()}`
      );
    }
    const body = (await response.json()) as { signedTransactionInfo?: string };
    if (!body.signedTransactionInfo) {
      throw new VerificationError('invalid_receipt', 'Apple returned no transaction info');
    }
    signedTransaction = body.signedTransactionInfo;
    break;
  }

  if (!signedTransaction) {
    throw new VerificationError(
      'invalid_receipt',
      notFound ? 'Apple does not know this transaction' : 'Apple did not return the transaction'
    );
  }

  // Safe to read without checking the signature: this came from Apple over TLS,
  // on a request they authenticated, in answer to the id we asked about.
  const transaction = decodeJwsPayload(signedTransaction);

  if (transaction.productId !== PRODUCT_ID || transaction.bundleId !== BUNDLE_ID) {
    throw new VerificationError('product_mismatch', 'Receipt is for a different product');
  }
  if (transaction.revocationDate) {
    throw new VerificationError('revoked', 'Apple revoked this purchase');
  }
  // Keyed on the original transaction id, not the current one: Apple issues a
  // fresh transactionId each time it re-delivers an owned non-consumable, and
  // those must all resolve to the one entitlement rather than piling up.
  const originalId = transaction.originalTransactionId ?? transaction.transactionId;
  if (typeof originalId !== 'string') {
    throw new VerificationError('invalid_receipt', 'Missing transaction id');
  }
  return `apple:${originalId}`;
}

function decodeJwsPayload(jws: string): Record<string, unknown> {
  const encoded = jws.split('.')[1];
  if (!encoded) throw new Error('Malformed JWS');
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
}

type GooglePurchase = {
  acknowledgementState?: number;
  orderId?: string;
  purchaseState?: number;
};

async function verifyGoogle(token: string): Promise<string> {
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
  return `google:${purchase.orderId ?? token}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
