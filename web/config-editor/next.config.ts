import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@julusian/midi"],
  webpack: (config) => {
    // Ensure native bindings are loaded at runtime
    config.externals = config.externals || [];
    return config;
  },
};

export default nextConfig;
