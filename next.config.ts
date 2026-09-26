import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // proxy.ts buffers request bodies (default 10 MB); uploads allow 14 MB plus multipart overhead.
  experimental: { proxyClientMaxBodySize: "15mb" },
};

export default nextConfig;
