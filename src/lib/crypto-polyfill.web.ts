/**
 * The web build's stand-in for the Hermes WebCrypto shim.
 *
 * The native polyfill exists because Hermes ships no `crypto.getRandomValues`
 * and no `crypto.subtle`, which auth-js needs to build a PKCE challenge.
 * Browsers have had both for years, and so has Node — so on web there is
 * nothing to install.
 *
 * It has to be a file rather than nothing at all: `supabase.ts` imports the
 * polyfill for its side effect, and Metro resolves `.web.ts` ahead of `.ts`.
 * Without this, static rendering ran the native version under Node and threw
 * on `globals.crypto = …`, because there `crypto` is a getter with no setter.
 */

export {};
