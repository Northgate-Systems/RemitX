import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/send", "/review", "/activity", "/anchors", "/routes", "/support"],
    },
    sitemap: "https://remitx.app/sitemap.xml",
  };
}