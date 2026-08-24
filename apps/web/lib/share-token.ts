/**
 * Share-token hygiene for /share/[token] and OG proxies.
 *
 * Some Web Share targets (notably WhatsApp) concatenate `text` onto `url`,
 * producing paths like `NUuUbWwFhc1b list $229,000 · DSCR…`. Strip anything
 * after the first whitespace / junk so those mangled links still resolve.
 */
export function sanitizeShareToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = raw.trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    /* keep raw */
  }
  // First path segment only — drop " list $229k…" glue and query/hash.
  t = t.split(/[\s?#/]/)[0] ?? "";
  // base64url tokens we mint are 12 chars of [A-Za-z0-9_-]; allow a bit of range.
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(t)) return null;
  return t;
}
