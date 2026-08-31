import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/sign-in",
          "/share/",
          "/privacy",
          "/terms",
          "/acceptable-use",
          "/data-disclaimer",
          "/support",
          "/opengraph-image",
          "/twitter-image",
        ],
        disallow: ["/admin", "/api/", "/auth/", "/home", "/projects", "/portfolio", "/settings"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
