// Only allow http(s) links to become clickable. A material's external_url is
// entered by an admin/DM; without this guard a value like "javascript:…" would
// render as an href and run on click (stored XSS). Anything that isn't an
// absolute http/https URL returns null and is shown as plain, non-clickable text.
export function safeExternalUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}

// The same question for a link that may legitimately be INTERNAL.
//
// `safeExternalUrl` above demands an absolute http(s) URL, which is right for a
// material somebody typed in and wrong for the mailbox: the call-to-action in a
// simulated email is normally a path in this same app ('/join?token=…'), and
// running it through the stricter guard would refuse every real link while
// letting no attack through. So this one accepts two shapes and nothing else:
//
//   1. A path rooted at this origin — '/join?token=abc'.
//   2. An absolute http(s) URL, delegated to safeExternalUrl.
//
// The case worth naming is '//evil.example/x'. It LOOKS like a path, it starts
// with a slash, and a browser reads it as another origin entirely. It is
// rejected here explicitly rather than left to a reader to notice.
//
// Everything else — 'javascript:', 'data:', 'vbscript:', a bare word — returns
// null, and the caller renders plain text instead of a link.
export function safeLinkHref(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) return null; // protocol-relative: another site
  if (trimmed.startsWith('/')) return trimmed;
  return safeExternalUrl(trimmed);
}
