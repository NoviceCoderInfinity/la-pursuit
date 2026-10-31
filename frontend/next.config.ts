import type { NextConfig } from "next";

const API = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // gzip buffers the proxied SSE trace until the run ends, so the live trace would never stream.
  compress: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;
