import * as ExpoCrypto from 'expo-crypto';

/**
 * WebCrypto shims for Hermes, imported before the Supabase client is created.
 *
 * Without these, @supabase/auth-js degrades the PKCE flow twice over, and both
 * failures are silent apart from one console warning:
 *
 *   1. generatePKCEVerifier() falls back to Math.random() when
 *      crypto.getRandomValues is missing, producing a predictable verifier.
 *   2. generatePKCEChallenge() falls back to the 'plain' challenge method when
 *      crypto.subtle is missing, sending the verifier in the clear in the
 *      authorization request — so anyone who observes it can exchange the code.
 *
 * Only the Google sign-in path uses PKCE; Apple and email codes do not.
 *
 * Everything is installed conditionally, so a future Hermes that ships these
 * natively takes precedence.
 */

type Mutable = Record<string, unknown>;
const globals = globalThis as unknown as Mutable;

// --- TextEncoder (UTF-8 only, which is all the spec allows) ----------------

if (typeof globals.TextEncoder === 'undefined') {
  class MinimalTextEncoder {
    readonly encoding = 'utf-8';

    encode(input = ''): Uint8Array {
      const bytes: number[] = [];
      for (let i = 0; i < input.length; i += 1) {
        let codePoint = input.codePointAt(i) as number;

        // Surrogate pairs arrive as two UTF-16 units; codePointAt already
        // combined them, so skip the trailing half.
        if (codePoint > 0xffff) i += 1;

        if (codePoint < 0x80) {
          bytes.push(codePoint);
        } else if (codePoint < 0x800) {
          bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
        } else if (codePoint < 0x10000) {
          bytes.push(
            0xe0 | (codePoint >> 12),
            0x80 | ((codePoint >> 6) & 0x3f),
            0x80 | (codePoint & 0x3f)
          );
        } else {
          bytes.push(
            0xf0 | (codePoint >> 18),
            0x80 | ((codePoint >> 12) & 0x3f),
            0x80 | ((codePoint >> 6) & 0x3f),
            0x80 | (codePoint & 0x3f)
          );
        }
      }
      return new Uint8Array(bytes);
    }
  }

  globals.TextEncoder = MinimalTextEncoder;
}

// --- btoa ------------------------------------------------------------------

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

if (typeof globals.btoa === 'undefined') {
  globals.btoa = (input: string): string => {
    let output = '';
    for (let i = 0; i < input.length; i += 3) {
      const a = input.charCodeAt(i);
      const b = i + 1 < input.length ? input.charCodeAt(i + 1) : NaN;
      const c = i + 2 < input.length ? input.charCodeAt(i + 2) : NaN;

      if (a > 0xff || b > 0xff || c > 0xff) {
        throw new Error('btoa: string contains characters outside of Latin1 range');
      }

      const triplet = (a << 16) | ((Number.isNaN(b) ? 0 : b) << 8) | (Number.isNaN(c) ? 0 : c);

      output += BASE64_ALPHABET[(triplet >> 18) & 0x3f];
      output += BASE64_ALPHABET[(triplet >> 12) & 0x3f];
      output += Number.isNaN(b) ? '=' : BASE64_ALPHABET[(triplet >> 6) & 0x3f];
      output += Number.isNaN(c) ? '=' : BASE64_ALPHABET[triplet & 0x3f];
    }
    return output;
  };
}

// --- crypto.getRandomValues / randomUUID / subtle.digest -------------------

const existingCrypto = (globals.crypto ?? {}) as Mutable;

if (typeof existingCrypto.getRandomValues !== 'function') {
  existingCrypto.getRandomValues = ExpoCrypto.getRandomValues;
}

if (typeof existingCrypto.randomUUID !== 'function') {
  existingCrypto.randomUUID = ExpoCrypto.randomUUID;
}

if (typeof existingCrypto.subtle === 'undefined') {
  existingCrypto.subtle = {
    // auth-js only ever asks for SHA-256; anything else should fail loudly
    // rather than quietly return the wrong digest.
    digest: async (algorithm: string | { name: string }, data: BufferSource) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (name.toUpperCase() !== 'SHA-256') {
        throw new Error(`crypto.subtle.digest: ${name} is not supported by this shim`);
      }
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
    },
  };
}

globals.crypto = existingCrypto;
