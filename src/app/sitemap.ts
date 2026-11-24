import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getEnv().APP_URL;
  return ["/", "/hi", "/privacy", "/terms", "/not-an-emergency-service", "/signup", "/login"].map(
    (p) => ({
      url: `${base}${p}`,
      changeFrequency: "weekly",
      priority: p === "/" || p === "/hi" ? 1 : 0.5,
    }),
  );
}
