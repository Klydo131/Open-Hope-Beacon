// What a person is told when something fails.
//
// THE BUG THIS EXISTS FOR, on a Guide's own screen: two red boxes reading
// "permission denied for table pairings" and "permission denied for function
// blog_feed", under their name and their reminders. Nobody outside a database
// can act on either sentence, and both were saying the same ordinary thing —
// you are signed out — in the least useful words available.
//
// This is the floor, not the fix. The reason those requests arrived as nobody
// is fixed in lib/supabase/client.ts. But a screen should never be able to
// print Postgres at somebody, whatever goes wrong upstream, so the translation
// lives here and every live screen goes through it.
//
// WRITTEN ONCE. The same ternary was copied into thirty-three components, each
// with its own fallback and none of them translating anything. Thirty-three
// copies of a decision is thirty-three places to forget it.

/** True when the message means "this request had no signed-in identity". */
const NOT_SIGNED_IN =
  /permission denied for (table|function|schema|relation|sequence)|jwt (expired|is invalid)|invalid claim|not authenticated|no api key/i;

/** True when the DATABASE allowed the identity but the rules refused the act. */
const NOT_ALLOWED = /row-level security|violates row-level security policy|insufficient privilege/i;

const OFFLINE = /failed to fetch|networkerror|network request failed|load failed/i;

/** Storage refused the file's type. The wording is Supabase's, not ours. */
const BAD_TYPE = /mime type .* is not supported/i;

/** Storage refused the file's size. */
const TOO_BIG = /maximum allowed size|payload too large|entity too large|413/i;

/**
 * The database refused a row because one like it is already there.
 *
 * THE BUG THIS EXISTS FOR, photographed off a Director's phone:
 *
 *     duplicate key value violates unique constraint "pairings_ds_id_dm_id_key"
 *
 * after trying to pair two people who had been disconnected. The constraint
 * name is the only thing Postgres offers, it is not a sentence, and a Director
 * reading it has no way to know the answer was "disconnect the other Guide
 * first". Any rule worth a real sentence gets one here; everything else at
 * least stops being SQL.
 */
const ALREADY_THERE = /duplicate key value violates unique constraint "([^"]+)"/i;

const ALREADY_THERE_SAYS: Record<string, string> = {
  pairings_one_active_guide: 'That Explorer already has a Guide. Disconnect the current one first.',
};

/**
 * Turn anything thrown into a sentence worth showing.
 *
 * @param cause    whatever was caught
 * @param fallback what to say when the cause carries no message of its own
 */
export function humanError(cause: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw = cause instanceof Error ? cause.message : '';
  if (!raw) return fallback;

  // Order matters: the signed-out case must be read before the rules case, or
  // "permission denied" gets reported as a rule the person has broken.
  if (NOT_SIGNED_IN.test(raw)) {
    return 'You have been signed out. Please sign in again to carry on.';
  }
  if (NOT_ALLOWED.test(raw)) {
    return 'You do not have permission to do that. If that seems wrong, ask your Director.';
  }
  if (OFFLINE.test(raw)) {
    return 'That could not reach the church. Check your connection and try again.';
  }
  if (BAD_TYPE.test(raw)) {
    return 'That kind of file cannot be attached. Photos, PDFs, Word documents, '
      + 'spreadsheets, slides, audio and plain text all work.';
  }
  if (TOO_BIG.test(raw)) {
    return 'That file is too large. The limit is 10 MB.';
  }
  const already = ALREADY_THERE.exec(raw);
  if (already) {
    return ALREADY_THERE_SAYS[already[1]] ?? 'That is already there, so it was not added again.';
  }
  return raw;
}
