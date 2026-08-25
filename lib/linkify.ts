// Turn the links people type into links they can tap.
//
// Somebody shares a passage, a video, a church notice — and until now it landed
// as dead text that the other person had to select, copy and paste into a
// browser. On a phone that is a genuine barrier, and the people this app is for
// are not the people who will bother.
//
// ---------------------------------------------------------------------------
// THIS IS AN INJECTION SURFACE, AND IT IS BUILT LIKE ONE.
//
// Everything below takes text that one member typed and renders it into a
// screen another member is reading. The obvious implementation — a regular
// expression that wraps matches in <a> tags, fed to dangerouslySetInnerHTML —
// is the single most common way an app of this shape gets an XSS hole, because
// the same string then carries both the link AND any markup the author felt
// like including.
//
// So this never produces HTML. It splits the text into plain strings and React
// elements, and React escapes every string it renders. There is no path from
// what somebody types to markup, whatever they type.
//
// THE SECOND HALF, which the escaping does not cover: a URL is not safe merely
// because it was escaped. `javascript:alert(1)` is a perfectly well-formed URL,
// and putting it in an href gives you script execution on click. So every
// candidate is parsed with the URL constructor and its protocol checked against
// an allowlist of exactly two. Anything else is left as the text it was.
//
// Both halves matter. The escaping stops markup; the allowlist stops schemes.
// ---------------------------------------------------------------------------

import { parseSafeHttpUrl } from './url.ts';

// Bare `www.` is included because that is how people actually write a link when
// they are not thinking about it. `<` is excluded from the run so a URL can
// never swallow the start of something that looks like a tag.
const CANDIDATE = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

/**
 * Trailing punctuation belongs to the sentence, not the address.
 *
 * "Have a look at https://example.org/psalms." — the full stop is the writer's,
 * and including it gives a broken link. Closing brackets are only trimmed when
 * the URL does not open one itself, so links that legitimately contain
 * parentheses survive.
 */
function trimTrailing(raw: string): { url: string; tail: string } {
  let url = raw;
  let tail = '';
  for (;;) {
    const last = url[url.length - 1];
    if (!last) break;
    if ('.,;:!?"\''.includes(last)) {
      tail = last + tail;
      url = url.slice(0, -1);
      continue;
    }
    if (last === ')' && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) {
      tail = last + tail;
      url = url.slice(0, -1);
      continue;
    }
    if ((last === ']' || last === '}') ) {
      tail = last + tail;
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return { url, tail };
}

/**
 * The href for a candidate, or null if it must stay plain text.
 *
 * Parsing rather than pattern-matching, because a regular expression that
 * decides what is safe is a regular expression somebody will eventually get
 * past. The URL constructor either understands it or throws, and then exactly
 * two protocols are allowed through.
 */
export function safeHref(candidate: string): string | null {
  // `www.example.org` is how people write a link when they are not thinking
  // about schemes. Everything after that is the shared decision in lib/url.ts,
  // so prose links and typed-in link fields cannot drift apart on what counts
  // as safe.
  const withScheme = /^www\./i.test(candidate) ? `https://${candidate}` : candidate;
  return parseSafeHttpUrl(withScheme)?.href ?? null;
}

/**
 * Split text into plain strings and anchors.
 *
 * Exported for the tests, which check the pieces rather than a rendered blob.
 */
export function linkifyParts(text: string): Array<string | { href: string; label: string }> {
  const parts: Array<string | { href: string; label: string }> = [];
  let cursor = 0;

  // A fresh regex per call: /g regexes carry lastIndex between uses, and a
  // shared one silently skips matches on every other call.
  const re = new RegExp(CANDIDATE.source, 'gi');
  let match = re.exec(text);

  while (match) {
    // A link has to START somewhere a link can start. Without this the pattern
    // happily matches the `https://...` buried inside `blob:https://...`, and
    // links a fragment of a larger token that the writer never wrote as a link.
    const before = match.index === 0 ? '' : text[match.index - 1];
    const atBoundary = before === '' || /[\s(<[{'"]/.test(before);

    const { url, tail } = trimTrailing(match[0]);
    const href = atBoundary ? safeHref(url) : null;

    if (href) {
      if (match.index > cursor) parts.push(text.slice(cursor, match.index));
      parts.push({ href, label: url });
      if (tail) parts.push(tail);
      cursor = match.index + match[0].length;
    }
    // No href means it stays text, and the slice below picks it up.

    match = re.exec(text);
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}
