/**
 * The link a post can carry, and what counts as one.
 *
 * Opened in an in-app browser on someone else's phone, which is why this is
 * checked rather than trusted. A `javascript:` or `data:` URL stored here would
 * be a way for an author to have every viewer of a post open something of their
 * choosing — so only http and https are accepted, and the same rule is written
 * into the column as a constraint, because the app is not the only thing that
 * can write to it.
 */

const WEB_URL = /^https?:\/\/\S+$/i;

/**
 * Tidy up what someone typed, or reject it.
 *
 * Returns the normalised URL, or null when there is nothing usable. A bare
 * "ektetid.no" gets https:// put in front of it — that is what the typist
 * meant, and refusing it over a missing scheme is pedantry.
 */
export function normaliseLink(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  if (!WEB_URL.test(candidate)) return null;

  // A scheme is not enough on its own: "https://" passes the pattern above
  // only with something after it, but a host with no dot and no port is a typo
  // rather than an address.
  try {
    const url = new URL(candidate);
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Whether what is typed so far could become a link, for enabling a control. */
export function isValidLink(input: string): boolean {
  return normaliseLink(input) !== null;
}

/**
 * The host, for labelling the button.
 *
 * A full URL on a photograph is noise; "nrk.no" says where the tap goes, which
 * is the one thing a reader needs before deciding to follow it. The `www.` is
 * dropped because it never distinguishes anything.
 */
export function linkLabel(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return link;
  }
}
