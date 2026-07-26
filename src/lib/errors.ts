/**
 * Pull a readable message out of whatever was thrown.
 *
 * Supabase rejects with plain objects carrying `message`, `code` and `hint` —
 * not Error instances. So the obvious `caught instanceof Error` check is false
 * for every database and storage failure, and the real reason gets swallowed
 * in favour of a generic fallback. That turned "your session refers to a user
 * that no longer exists" into "Klarte ikke å publisere".
 */
export function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof Error && caught.message) return caught.message;

  if (typeof caught === 'object' && caught !== null) {
    const shaped = caught as { message?: unknown; error_description?: unknown; code?: unknown };
    const message =
      typeof shaped.message === 'string'
        ? shaped.message
        : typeof shaped.error_description === 'string'
          ? shaped.error_description
          : null;

    /*
     * 42501 is Postgres refusing a write under row-level security.
     *
     * Every policy in this app authorises against auth.uid(), so a refusal
     * nearly always means the request arrived with a different session than
     * the one the app thinks it has — an expired or replaced token — rather
     * than the user genuinely lacking permission. Saying so gives them
     * something to act on; quoting the database does not.
     */
    if (shaped.code === '42501') {
      return 'Økten din har utløpt. Logg ut og inn igjen, så prøver du på nytt.';
    }

    if (message) {
      // The code is what makes a Postgres error searchable; 23503 is a foreign
      // key violation, 42501 an RLS denial.
      return typeof shaped.code === 'string' ? `${message} (${shaped.code})` : message;
    }
  }

  if (typeof caught === 'string' && caught) return caught;
  return fallback;
}
