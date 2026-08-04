/**
 * Web Push delivery, written against Web Crypto.
 *
 * There is no service to POST to here: a browser push goes directly to an
 * endpoint the browser vendor owns, carrying a payload only that browser can
 * decrypt. Two specifications are involved, and both are implemented below
 * rather than pulled in from npm — the Node libraries for this want `https` and
 * node crypto, which is a poor fit for a Deno edge runtime, and the algorithms
 * are small enough to read.
 *
 *   RFC 8291  Message Encryption for Web Push (aes128gcm)
 *   RFC 8292  VAPID — proving to the push service who is sending
 *
 * Nothing here is secret to the recipient: the payload is encrypted to keys the
 * subscription itself supplied, so the push service forwards bytes it cannot
 * read.
 */

/**
 * A byte array known to be backed by a plain ArrayBuffer.
 *
 * WebCrypto's BufferSource excludes SharedArrayBuffer-backed views, and a bare
 * `Uint8Array` is generic over both — so every buffer handed to subtle.crypto
 * has to say which it is.
 */
type Bytes = Uint8Array<ArrayBuffer>;

export type Subscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushContent = {
  title: string;
  body: string;
  url: string;
};

/** How long the push service should hold a message for an offline browser. */
const TTL_SECONDS = 60 * 60 * 24;

/** The record size the payload is padded to. One record is enough for our text. */
const RECORD_SIZE = 4096;

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

function decodeBase64Url(value: string): Bytes {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(bytes: Bytes): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Bytes[]): Bytes {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// VAPID
// ---------------------------------------------------------------------------

/**
 * The private key as `web-push generate-vapid-keys` prints it: the raw 32-byte
 * scalar, base64url. WebCrypto will only import a P-256 private key as JWK, and
 * a JWK needs the public coordinates alongside it — so they are recovered from
 * the public key, which is the uncompressed 65-byte point.
 */
async function importVapidKey(privateKey: string, publicKey: string): Promise<CryptoKey> {
  const d = decodeBase64Url(privateKey);
  const point = decodeBase64Url(publicKey);

  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: encodeBase64Url(d),
      x: encodeBase64Url(point.slice(1, 33)),
      y: encodeBase64Url(point.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

/**
 * A signed assertion that this sender is who it claims to be.
 *
 * Scoped to the push service's origin and short-lived, so a token captured from
 * one request cannot be replayed at another service or indefinitely.
 */
async function vapidToken(
  endpoint: string,
  subject: string,
  privateKey: string,
  publicKey: string
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };

  const encoder = new TextEncoder();
  const signingInput = `${encodeBase64Url(encoder.encode(JSON.stringify(header)))}.${encodeBase64Url(
    encoder.encode(JSON.stringify(claims))
  )}`;

  const key = await importVapidKey(privateKey, publicKey);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(signingInput)
  );

  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

// ---------------------------------------------------------------------------
// aes128gcm
// ---------------------------------------------------------------------------

async function hkdf(
  salt: Bytes,
  ikm: Bytes,
  info: Bytes,
  length: number
): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

const label = (text: string): Bytes => new TextEncoder().encode(text) as Bytes;

/**
 * Encrypt one message to one subscription.
 *
 * The shared secret comes from an ephemeral key of ours and the permanent key
 * the browser gave us, so every message is encrypted to a fresh key and the
 * push service — which sees the ciphertext — never holds anything that decrypts
 * it. The auth secret from the subscription is mixed in so that possession of
 * the public key alone is not enough.
 */
async function encrypt(
  subscription: Subscription,
  payload: string
): Promise<{ body: Bytes }> {
  const userPublic = decodeBase64Url(subscription.p256dh);
  const authSecret = decodeBase64Url(subscription.auth);

  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const localPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));

  const imported = await crypto.subtle.importKey(
    'raw',
    userPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: imported }, local.privateKey, 256)
  );

  // RFC 8291 §3.3: the auth secret salts the shared secret, and the two public
  // keys are bound into the info so a message cannot be replayed to a different
  // subscription.
  const ikm = await hkdf(
    authSecret,
    shared,
    concat(label('WebPush: info\0'), userPublic, localPublic),
    32
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(salt, ikm, label('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, label('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);

  // 0x02 marks the last record. Without a delimiter the receiver cannot tell
  // padding from content.
  const plaintext = concat(new TextEncoder().encode(payload) as Bytes, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, plaintext)
  );

  // RFC 8188 header: salt, record size, then our public key so the receiver can
  // derive the same secret.
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE);

  return {
    body: concat(salt, recordSize, new Uint8Array([localPublic.length]), localPublic, ciphertext),
  };
}

// ---------------------------------------------------------------------------
// sending
// ---------------------------------------------------------------------------

export type PushResult = { endpoint: string; ok: boolean; gone: boolean };

/**
 * Deliver one notification.
 *
 * `gone` reports the two statuses that mean the subscription will never work
 * again — the browser was uninstalled, or permission was revoked — so the
 * caller can delete the row rather than retrying it forever.
 */
export async function sendWebPush(
  subscription: Subscription,
  content: PushContent,
  vapid: { publicKey: string; privateKey: string; subject: string }
): Promise<PushResult> {
  try {
    const { body } = await encrypt(subscription, JSON.stringify(content));
    const token = await vapidToken(
      subscription.endpoint,
      vapid.subject,
      vapid.privateKey,
      vapid.publicKey
    );

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${token}, k=${vapid.publicKey}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(TTL_SECONDS),
      },
      body: body as unknown as BodyInit,
    });

    /*
     * Logged because a rejected push is otherwise completely silent: the
     * browser shows nothing, the caller sees a count, and the reason lives only
     * in a response nobody read. 401 and 403 mean the VAPID signature was not
     * accepted; 400 usually means the encrypted body is malformed.
     */
    if (!response.ok) {
      console.error(
        `web push ${response.status} ${new URL(subscription.endpoint).host}: ${(
          await response.text()
        ).slice(0, 300)}`
      );
    }

    return {
      endpoint: subscription.endpoint,
      ok: response.ok,
      gone: response.status === 404 || response.status === 410,
    };
  } catch (caught) {
    // One unreachable push service must not stop the rest of the fan-out.
    console.error(`web push threw: ${caught instanceof Error ? caught.message : String(caught)}`);
    return { endpoint: subscription.endpoint, ok: false, gone: false };
  }
}
