import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const env = getEnv();
  const base = env.APP_URL;
  // The public demo website should not show up in search results.
  if (env.isHostedDemo) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/demo", "/api", "/invite"] },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
