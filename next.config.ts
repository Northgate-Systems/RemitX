import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security-edge";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Covers every response, including static assets/paths that the
        // middleware matcher excludes (see config.matcher in
        // src/middleware.ts) - see SECURITY_HEADERS in
        // src/lib/security-edge.ts for the single source of truth.
        source: "/(.*)",
        headers: SECURITY_HEADERS as { key: string; value: string }[],
      },
    ];
  },
  poweredByHeader: false,
};

export default nextConfig;
