/**
 * Canonical public site origin for OG tags, share links, and redirects.
 * Prefer www in production — apex papuc.app 308s there, and mismatched hosts
 * confuse Facebook's scraper (canonical vs fetched URL).
 *
 * Preview deploys must NEVER resolve to papuc.app: that sends OAuth / share
 * links off the preview host onto production (main).
 */
export function getSiteUrl(reqUrl?: string): string {
  // Branch / deployment previews: stay on this deployment's host.
  if (process.env.VERCEL_ENV === "preview") {
    if (reqUrl) {
      try {
        return new URL(reqUrl).origin;
      } catch {
        /* fall through */
      }
    }
    const vercelHost = process.env.VERCEL_URL?.replace(/^https?:\/\//, "").replace(
      /\/$/,
      "",
    );
    if (vercelHost) return `https://${vercelHost}`;
  }

  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) {
    // Normalize apex → www when the env still points at the redirecting host.
    if (fromEnv === "https://papuc.app" || fromEnv === "http://papuc.app") {
      return "https://www.papuc.app";
    }
    // Ignore production site URL if somehow evaluated on preview without VERCEL_ENV.
    if (
      process.env.VERCEL_ENV === "preview" &&
      (fromEnv.includes("papuc.app") || fromEnv.includes("localhost"))
    ) {
      const vercelHost = process.env.VERCEL_URL?.replace(/^https?:\/\//, "");
      if (vercelHost) return `https://${vercelHost}`;
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
