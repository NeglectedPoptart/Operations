import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist is large and has its own internal dynamic requires - left
  // unbundled so Vercel's serverless function resolves it directly at
  // runtime instead of Turbopack tracing/transforming it.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
