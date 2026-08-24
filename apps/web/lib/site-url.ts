/**
 * Canonical public site origin for OG tags, share links, and redirects.
 * Prefer www — apex papuc.app 308s there, and mismatched hosts confuse
 * Facebook's scraper (canonical vs fetched URL).
 */
export function getSiteUrl(reqUrl?: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) {
    // Normalize apex → www when the env still points at the redirecting host.
    if (fromEnv === "https://papuc.app" || fromEnv === "http://papuc.app") {
      return "https://www.papuc.app";
    }
    return fromEnv;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "");
    if (host === "papuc.app") return "https://www.papuc.app";
    return `https://${host}`;
  }
  if (reqUrl) {
    try {
      const origin = new URL(reqUrl).origin;
      if (origin === "https://papuc.app" || origin === "http://papuc.app") {
        return "https://www.papuc.app";
      }
      return origin;
    } catch {
      /* fall through */
    }
  }
  return "https://www.papuc.app";
}
