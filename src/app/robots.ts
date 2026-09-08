import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep in sync with the `(app)` route group under src/app/(app)/ -
      // every one of those pages sits behind the auth check in middleware.ts,
      // so none of them belong in a crawler's index. Missing "/rates" here
      // let it slip through even though middleware already requires a
      // session for it.
      disallow: ["/api/", "/dashboard", "/send", "/review", "/activity", "/anchors", "/routes", "/support", "/rates"],
    },
    sitemap: "https://remitx.app/sitemap.xml",
  };
}