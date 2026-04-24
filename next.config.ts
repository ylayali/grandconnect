import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Allow ESLint to only warn during builds (not block them)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Allow TypeScript to only warn during builds (not block them)
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
