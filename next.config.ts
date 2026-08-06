import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default Server Action body limit (1mb) is too small for Marketing's
    // brand-asset uploads (packaging mockups etc. easily exceed that).
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
