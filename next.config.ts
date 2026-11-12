import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Delivered price sheet agent draws the sheet on the server with a native canvas library, the bundled
  // fonts and the logo - keep the library out of the bundle and make sure those files ship with the functions
  // that run agents (the 15-minute tick, and Run now on the Agents page).
  serverExternalPackages: ["@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/agents/tick": ["./src/lib/fonts/**", "./public/logo-hbi-2025-white.png"],
    "/submanagement/agents": ["./src/lib/fonts/**", "./public/logo-hbi-2025-white.png"],
  },
  experimental: {
    // Default Server Action body limit (1mb) is too small for Marketing's
    // brand-asset uploads (packaging mockups etc. easily exceed that).
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
