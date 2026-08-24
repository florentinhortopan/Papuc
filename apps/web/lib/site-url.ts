/**
 * Canonical public site origin for OG tags, share links, and redirects.
 */
export function getSiteUrl(reqUrl?: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  if (reqUrl) {
    try {
      return new URL(reqUrl).origin;
    } catch {
      /* fall through */
    }
  }
  return "https://papuc.app";
}
