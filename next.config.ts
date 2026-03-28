import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    // @ts-expect-error - Expected in Next.js 15
    allowedDevOrigins: ["localhost", "172.20.10.3"],
  },
};

export default nextConfig;
