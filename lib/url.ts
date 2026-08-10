// Only allow http(s) links to become clickable. A material's external_url is
// entered by an admin/DM; without this guard a value like "javascript:…" would
// render as an href and run on click (stored XSS). Anything that isn't an
// absolute http/https URL returns null and is shown as plain, non-clickable text.
export function safeExternalUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}
