import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/api/v1/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }];
  },
};

export default nextConfig;
