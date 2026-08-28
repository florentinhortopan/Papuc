import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/sign-in", "/share/", "/privacy", "/support"],
        disallow: ["/admin", "/api/", "/auth/"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
