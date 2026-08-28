import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  const lastModified = new Date();
  return [
    { url: site, lastModified, changeFrequency: "weekly", priority: 1 },
    {
      url: `${site}/sign-in`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${site}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${site}/support`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${site}/lenders`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
