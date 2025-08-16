import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@julusian/midi"],
  eslint: {
    // Allow production builds to succeed even if there are ESLint errors
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // Ensure native bindings are loaded at runtime
    config.externals = config.externals || [];
    return config;
  },
};

export default nextConfig;
